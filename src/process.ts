import {PayloadBody} from "./payload";
import * as PdfJS from 'pdfjs-dist/legacy/build/pdf'
import {QRCode} from "jsqr";
import * as Sentry from '@sentry/react';
import * as Decode from './decode';
import {getScannedJWS, verifyJWS, decodeJWS} from "./shc";

import { PDFPageProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";

// import {PNG} from 'pngjs'
// import {decodeData} from "./decode";
// import {Result} from "@zxing/library";

PdfJS.GlobalWorkerOptions.workerSrc = pdfjsWorker;          // use the built-in version to avoid using cloudflare, which is considered a tracker by Safari
// PdfJS.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PdfJS.version}/pdf.worker.js`

class ImageDataWithDataUri {
    imageData: ImageData;
    dataUri?: string;
}

export async function getPayloadBodyFromFile(file: File): Promise<PayloadBody> {
    // Read file

    const fileBuffer = await file.arrayBuffer();

    let imageData: ImageDataWithDataUri[];

    if (file.type === 'application/pdf') {
        imageData = await getImageDataFromPdf(fileBuffer);
    } else if (file.type === 'image/png' || file.type === 'image/jpeg' || 
                file.type === 'image/webp' || file.type === 'image/gif') {
                console.log(`image ${file.type}`);
                imageData = [await getImageDataFromImage(file)];
    } else {
        throw Error('invalidFileType')
    }

    // Send back our SHC payload now
    return processSHC(imageData);
}

async function getImageDataFromPdfPage(pdfPage: PDFPageProxy, numPages: number): Promise<ImageDataWithDataUri> {

    const pdfScale = 4;

    const canvas = <HTMLCanvasElement>document.getElementById('canvas');
    const canvasContext = canvas.getContext('2d');
    const viewport = pdfPage.getViewport({scale: pdfScale});

    // Set correct canvas width / height
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // const textContent = await pdfPage.getTextContent();
    // let doseNumber = 0;
    // let doseVaccineNames = [];
    // const textItems = textContent.items;
    // for (let i = 0; i < textItems.length; i++) {
    //     const textItem = textItems[i] as TextItem;
    //     if (textItem.str.startsWith('Product ')) {
    //         const nextTextItem = textItems[i+1] as TextItem;
    //         doseVaccineNames.push(nextTextItem.str);
    //         doseNumber++;
    //     }
    // }
    // console.log(doseVaccineNames);

    // render PDF
    const renderTask = pdfPage.render({
        canvasContext: canvasContext,
        viewport,
    })

    await renderTask.promise;
    console.log('PDF rendered');

    const imageData = canvasContext.getImageData(0, 0, viewport.width, viewport.height);

    const dataUri = canvas.toDataURL();
    const imageDataWithDataUri : ImageDataWithDataUri = new ImageDataWithDataUri();
    imageDataWithDataUri.imageData = imageData;
    imageDataWithDataUri.dataUri = dataUri;
    // Return PDF Image Data
    return Promise.resolve(imageDataWithDataUri);

}

function getImageDataFromImage(file: File): Promise<ImageDataWithDataUri> {
    return new Promise((resolve, reject) => {
        const canvas = <HTMLCanvasElement>document.getElementById('canvas');
        const canvasContext = canvas.getContext('2d');

        // create Image object
        const img = new Image();

        img.onload = () => {
            // constrain image to 2 Mpx
            const maxPx = 2000000;
            let width: number;
            let height: number;
            if (img.naturalWidth * img.naturalHeight > maxPx) {
                const ratio = img.naturalHeight / img.naturalWidth;
                width = Math.sqrt(maxPx / ratio);
                height = Math.floor(width * ratio);
                width = Math.floor(width);
            } else {
                width = img.naturalWidth;
                height = img.naturalHeight;
            }

            // Set correct canvas width / height
            canvas.width = width;
            canvas.height = height;

            // draw image into canvas
            canvasContext.clearRect(0, 0, width, height);
            canvasContext.drawImage(img, 0, 0, width, height);

            // Obtain image data
            const imageData = canvasContext.getImageData(0, 0, width, height);
            const dataUri = canvas.toDataURL();
            const imageDataWithDataUri : ImageDataWithDataUri = new ImageDataWithDataUri();
            imageDataWithDataUri.imageData = imageData;
            imageDataWithDataUri.dataUri = dataUri;
            resolve(imageDataWithDataUri);
        };

        img.onerror = (e) => {
            reject(e);
        };

        // start loading image from file
        img.src = URL.createObjectURL(file);
    });
}

async function getImageDataFromPdf(fileBuffer: ArrayBuffer): Promise<ImageDataWithDataUri[]> {

    // console.log(fileBuffer);

    const typedArray = new Uint8Array(fileBuffer);
    // console.log('typedArray');

    const loadingTask = PdfJS.getDocument(typedArray);
    console.log('loadingTask');

    const pdfDocument = await loadingTask.promise;
    console.log('SHC PDF loaded');
    const retArray = [];
    let fullUri = '';
    if ((navigator.userAgent.indexOf('Safari') >= 0) && (navigator.userAgent.indexOf('iPhone') >= 0)) {
        fullUri = `data:application/pdf;base64,${Buffer.from(fileBuffer).toString("base64")}`
    }

    // Load and return every page in our PDF
    for (let i = 1; i <= pdfDocument.numPages; i++) {
        console.log(`Processing PDF page ${i}`);
        const pdfPage = await pdfDocument.getPage(i);
        let imageDataWithDataUri = await getImageDataFromPdfPage(pdfPage, pdfDocument.numPages);
        if (fullUri.length > 0) {
            imageDataWithDataUri.dataUri = fullUri;
        }
        retArray.push(imageDataWithDataUri);
    }

    return Promise.resolve(retArray);
}

export async function processSHCCode(shcQrCode : string) : Promise<PayloadBody> {
    console.log('processSHCCode');

    try {
        // We found a QR code of some kind - start analyzing now
        const jws = getScannedJWS(shcQrCode);
        const decoded = await decodeJWS(jws);

        console.log(decoded);

        // this is a temporary bypass for the issue with the issuer not being in the JWS, it only happens to new JWS signed by Ontario (old JWS are still valid)

        let verified = false;
        if (['https://prd.pkey.dhdp.ontariohealth.ca','https://smarthealthcard.phsa.ca/v1/issuer',
            'https://covidrecords.alberta.ca/smarthealth/issuer','https://pvc.cloud.forces.gc.ca',
            'https://covid19.quebec.ca/PreuveVaccinaleApi/issuer'
    
            ].includes(decoded.iss)) {
            verified = true;
        } else {
            console.log('verifying signature');
            verified = await verifyJWS(jws, decoded.iss);
        }

        if (verified) {
            const shcReceipt = await Decode.decodedStringToReceipt(decoded);
            //console.log(shcReceipt);
            return Promise.resolve({receipts: null, shcReceipt, rawData: shcQrCode});            
        } else {
            // If we got here, we found an SHC which was not verifiable. Consider it fatal and stop processing.
            return Promise.reject(`Issuer ${decoded.iss} cannot be verified.`);
        }                    
    } catch (e) {
        return Promise.reject(e);
    }
} 

async function processSHC(allImageData : ImageDataWithDataUri[]) : Promise<PayloadBody> {

    console.log('processSHC');

    try {
        if (allImageData) {
            for (let i = 0; i < allImageData.length; i++) {

                const imageData = allImageData[i];
                const code : QRCode = await Decode.getQRFromImage(imageData.imageData);

        		if (code) {
                    try {
                        const payloadBody = await processSHCCode(code.data);
                        payloadBody.dataUrl = imageData.dataUri;
                        // console.log('dataUrl = ' + payloadBody.dataUrl);
                        return Promise.resolve(payloadBody);
                    } catch (e) {
                        // We blew up during processing - log it and move on to the next page
                        console.log(e);
                    }
                }    
            }
        }

        // If we got here, no SHC was detected and successfully decoded.
        // The vast majority of our processed things right now are ON proof-of-vaccination PDFs, not SHC docs, so assume anything
        // that blew up here was a malformed ON proof-of-vaccination and create an appropriate error message for that
        return Promise.reject(new Error('No SHC QR code found! Please try taking another picture of the SHC you wish to import'));

    } catch (e) {
        Sentry.captureException(e);
        return Promise.reject(e);
    }
}

