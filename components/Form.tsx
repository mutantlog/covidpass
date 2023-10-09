import {saveAs} from 'file-saver';
import React, {FormEvent, useEffect, useRef, useState} from "react";
import {BrowserQRCodeReader, IScannerControls} from "@zxing/browser";
import {Result} from "@zxing/library";
import {useTranslation} from 'next-i18next';

import Card from "./Card";
import Alert from "./Alert";
import Check from './Check';
import {PayloadBody} from "../src/payload";
import {getPayloadBodyFromFile, processSHCCode} from "../src/process";
import {PassData} from "../src/pass";
import {Photo} from "../src/photo";
import {isIOS, isMacOs, isAndroid, isSafari, osVersion, getUA, browserName, browserVersion} from 'react-device-detect';
import * as Sentry from '@sentry/react';
import Bullet from './Bullet';
import { GPayData } from '../src/gpay';
import Dropdown from './Dropdown';
import { debug } from 'webpack';

const getTheme = () => {
    if (typeof window !== 'undefined' && 
        window.localStorage) {
  
      const storedPrefs = 
        window.localStorage.getItem('color-theme')
      if (typeof storedPrefs === 'string') {
        return storedPrefs
      }
  
      const userMedia = 
        window.matchMedia('(prefers-color-scheme: dark)')
      if (userMedia.matches) {
        return 'dark'
      }
    }
  
    // If you want to use light theme as the default, 
    // return "light" instead
    return 'light'
  }

const options = [
    { label: 'Alberta', value: 'https://covidrecords.alberta.ca/form'},
    { label: 'British Columbia', value: 'https://www.healthgateway.gov.bc.ca/vaccinecard'},
    { label: 'Canadian Armed Forces', value: 'https://www.canada.ca/en/department-national-defence/campaigns/covid-19/covid-19-vaccines-for-canadian-armed-forces-members.html#proof'},
    { label: 'Manitoba', value: 'https://www.gov.mb.ca/covid19/vaccine/immunizationrecord/residents.html'},
    { label: 'New Brunswick', value: 'https://myhealth.gnb.ca/'},
    { label: 'Newfoundland and Labrador', value: 'https://vaccineportal.nlchi.nl.ca/'},
    { label: 'Northwest Territories', value: 'https://www.gov.nt.ca/covid-19/en/request/proof-vaccination'},
    { label: 'Nunavut', value: 'https://gov.nu.ca/sites/default/files/covid_proof_of_vaccination_qa_for_nunavut_october_14_2021.pdf'},
    { label: 'Nova Scotia', value: 'https://novascotia.flow.canimmunize.ca/en/portal'},
    { label: 'Ontario', value: 'https://covid19.ontariohealth.ca'},
    { label: 'Prince Edward Island', value: 'https://pei.flow.canimmunize.ca/en/portal'},
    { label: 'Québec', value: 'https://covid19.quebec.ca/PreuveVaccinale'},
    { label: 'Saskatchewan', value: 'https://services.saskatchewan.ca/#/login'},
    { label: 'Yukon', value: 'https://service.yukon.ca/forms/en/get-covid19-proof-of-vaccination'},
]

function Form(): JSX.Element {
    const {t} = useTranslation(['index', 'errors', 'common']);

    // Whether camera is open or not
    const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);

    // Currently selected dose
    const [selectedDose, setSelectedDose] = useState<number>(2);

    // Global camera controls
    const [globalControls, setGlobalControls] = useState<IScannerControls>(undefined);

    // Currently selected QR Code / File. Only one of them is set.
    const [qrCode, setQrCode] = useState<Result>(undefined);
    const [file, setFile] = useState<File>(undefined);
    const [file2, setFile2] = useState<File>(undefined);

    const [payloadBody, setPayloadBody] = useState<PayloadBody>(undefined);

    const [saveLoading, setSaveLoading] = useState<boolean>(false);
    const [fileLoading, setFileLoading] = useState<boolean>(false);
    const [file2Loading, setFile2Loading] = useState<boolean>(false);

    const [generated, setGenerated] = useState<boolean>(false);         // this flag represents the file has been used to generate a pass

    const [isDisabledAppleWallet, setIsDisabledAppleWallet] = useState<boolean>(false);
    const [isDisabledGooglePay, setIsDisabledGooglePay] = useState<boolean>(false);
    const [isDisabledFastLink, setIsDisabledFastLink] = useState<boolean>(true);

    const [addErrorMessages, _setAddErrorMessages] = useState<Array<string>>([]);
    const [fileErrorMessages, _setFileErrorMessages] = useState<Array<string>>([]);

    const [showDoseOption, setShowDoseOption] = useState<boolean>(false);

    // const [warningMessages, _setWarningMessages] = useState<Array<string>>([]);
    const hitcountHost = 'https://stats.evergreen-labs.com';

    // Check if there is a translation and replace message accordingly
    const setAddErrorMessage = (message: string) => {
        if (!message) {
            return;
        }

        const translation = t('errors:'.concat(message));
        _setAddErrorMessages(Array.from(new Set([...addErrorMessages, translation !== message ? translation : message])));
    };

    const setFileErrorMessage = (message: string) => {
        if (!message) {
            return;
        }

        const translation = t('errors:'.concat(message));
        _setFileErrorMessages(Array.from(new Set([...addErrorMessages, translation !== message ? translation : message])));
    };

    const deleteAddErrorMessage = (message: string) =>{
        _setAddErrorMessages(addErrorMessages.filter(item => item !== message))
    }

    // File Input ref
    const inputFile = useRef<HTMLInputElement>(undefined)

    const inputFile2 = useRef<HTMLInputElement>(undefined)


    // Add event listener to listen for file change events
    useEffect(() => {

        let payloadBody;

        if (inputFile && inputFile.current) {
            inputFile.current.addEventListener('change', async () => {
                let selectedFile = inputFile.current.files[0];
                if (selectedFile) {
                    setFileLoading(true);
                    setQrCode(undefined);
                    setPayloadBody(undefined);
                    setFile(undefined);
                    setShowDoseOption(false);
                    setGenerated(false);
                    deleteAddErrorMessage(t('errors:'.concat('noFileOrQrCode')));
                    _setFileErrorMessages([]);
                    checkBrowserType();
                    payloadBody = await getPayload(selectedFile);
                    await renderPhoto(payloadBody);
                }
            });
        }
        if (inputFile2 && inputFile2.current) {
            inputFile2.current.addEventListener('change', async () => {
                let selectedFile2 = inputFile2.current.files[0];
                if (selectedFile2) {
                    setFile2Loading(true);
                    setFile2(selectedFile2);
                    await storeFileToLocalStorageBase64('extra', selectedFile2);
                    payloadBody.extraUrl = 'extra';
                    setFile2Loading(false);
                }
            });
        }
        checkBrowserType();
    }, [inputFile, inputFile2])

    async function storeFileToLocalStorageBase64(key: string, file: File) {
        
        if (window.localStorage && file.type.includes('application/pdf')) {

            // https://stackoverflow.com/a/56738510/2789065

            console.log('storing buffer ' + file.type);
            const buffer = Buffer.from(await new Response(file).arrayBuffer());
            let dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
            localStorage.setItem(key, dataUrl);

        }
    }

    async function getPayload(file) : Promise<PayloadBody> {

        try {
            const payload = await getPayloadBodyFromFile(file);

            if (file2) {
                payload.extraUrl = file2.name;
            }

            setPayloadBody(payload);
            setFileLoading(false);
            setFile(file);
            if (payload.rawData.length == 0) {
                if (Object.keys(payload.receipts).length === 1) {
                    setSelectedDose(parseInt(Object.keys(payload.receipts)[0]));
                } else {
                    setShowDoseOption(true);
                }
            }
            
            return Promise.resolve(payload);
        } catch (e) {
            setFile(file);
            setFileLoading(false);
            if (e) {
                console.error(e);

                // Don't report known errors to Sentry
                if (!e.message.includes('invalidFileType') &&
					!e.message.includes('No SHC QR code found')) {
                  Sentry.captureException(e);
                }

                if (e.message != undefined) {
                    setFileErrorMessage(e.message);
                } else {
                    setFileErrorMessage('unableToContinue');
                }

            } else {
                setFileErrorMessage('unexpected');
            }
        }
    }

    // Show file Dialog
    async function showFileDialog() {
        hideCameraView();
        
        // Clear out any currently-selected files
        inputFile.current.value = '';

        // Hide our existing pass image
        document.getElementById('shc-pass-image').hidden = true;
        document.getElementById('shc-image-header').hidden = true;

        inputFile.current.click();
    }

    async function showFile2Dialog() {
        inputFile2.current.click();

    }

    async function goToFAQ(e : any) {
        e.preventDefault();
        window.location.href = '/faq';
    }
    
    // Hide camera view
    async function hideCameraView() {
        if (globalControls) {
            globalControls.stop();
        }
        setIsCameraOpen(false);
        _setFileErrorMessages([]);
    }

    // Show camera view
    async function showCameraView() {
        // Create new QR Code Reader
        const codeReader = new BrowserQRCodeReader();

        // Needs to be called before any camera can be accessed
        let deviceList: MediaDeviceInfo[];

        try {
            deviceList = await BrowserQRCodeReader.listVideoInputDevices();
        } catch (e) {
            setFileErrorMessage('noCameraAccess');
            return;
        }

        // Check if camera device is present
        if (deviceList.length == 0) {
            setFileErrorMessage("noCameraFound");
            return;
        }

        // Get preview Element to show camera stream
        const previewElem: HTMLVideoElement = document.querySelector('#cameraPreview');

        // Set Global controls
        setGlobalControls(
            // Start decoding from video device
            await codeReader.decodeFromVideoDevice(undefined,
                previewElem,
                async (result, error, controls) => {
                    if (result) {
                        const qrCode = result.getText();
                        // Check if this was a valid SHC QR code - if it was not, display an error
                        if (!qrCode.startsWith('shc:/')) {
                            setFileErrorMessage(t('invalidSHC'));
                        } else {
                            _setFileErrorMessages([]);
                            setQrCode(result);
                            setFile(undefined);
                            setPayloadBody(undefined);
                            setShowDoseOption(false);
                            setGenerated(false);
                            checkBrowserType();
                            
                            const payloadBody = await processSHCCode(qrCode);
                            
                            setPayloadBody(payloadBody);

                            controls.stop();
    
                            // Reset
                            setGlobalControls(undefined);
                            setIsCameraOpen(false);
            
                            await renderPhoto(payloadBody); 
                        }
                    }
                    if (error) {
                        setFileErrorMessage(error.message);
                    }
                }
            )
        );

        // Hide our existing pass image
        document.getElementById('shc-pass-image').hidden = true;
        document.getElementById('shc-image-header').hidden = true;

        setQrCode(undefined);
        setPayloadBody(undefined);
        setFile(undefined);
        setShowDoseOption(false);
        setGenerated(false);
        _setFileErrorMessages([]);

        setIsCameraOpen(true);
    }

    async function incrementCount() {
        try {
            if (typeof generated == undefined || !generated) {

                const request = `${hitcountHost}/count?url=pass.vaccine-ontario.ca`;
                //console.log(request);

                let response = await fetch(request);
                //console.log(response);

                setGenerated(true);
            }

        } catch (e) {
	        // Fail silently - we shouldn't blow up receipt processing because we couldn't increment our counter
            console.error(e);
            //return Promise.reject(e);
        }
    }

    // Add Pass to wallet
    async function addToWallet(event: FormEvent<HTMLFormElement>) {
        
        event.preventDefault();
        setSaveLoading(true);

        if (!file && !qrCode) {
            setAddErrorMessage('noFileOrQrCode')
            setSaveLoading(false);
            return;
        }

        try {
            if (payloadBody) {
            

                const selectedReceipt = payloadBody.shcReceipt;
                const filenameDetails = selectedReceipt.cardOrigin.replace(' ', '-');
                const passName = selectedReceipt.name.replace(' ', '-');
                const covidPassFilename = `grassroots-receipt-${passName}-${filenameDetails}.pkpass`;

                const pass = await PassData.generatePass(payloadBody, selectedDose);

                const passBlob = new Blob([pass], {type: "application/vnd.apple.pkpass"});

                await incrementCount();
                
                if (isIOS && isSafari) {
                    try {
                        
                        localStorage.setItem(`receipt-${payloadBody.serialNumber}`, payloadBody.dataUrl);
                        console.log(`receipt-${payloadBody.serialNumber} saved`);

                    } catch (e) {
                        // clear old receipts and retry
                        console.info('clearing old receipts');
                        localStorage.clear();
                        localStorage.setItem(`receipt-${payloadBody.serialNumber}`, payloadBody.dataUrl);
                    }
                }

                saveAs(passBlob, covidPassFilename);
                setSaveLoading(false);
            } 
        } catch (e) {

            if (e) {
                console.error(e);
                Sentry.captureException(e);

                if (e.message) {
                    setAddErrorMessage(e.message);
                } else {
                    setAddErrorMessage('unableToContinue');
                }

            } else {
                setAddErrorMessage('unexpected');
            }

            setSaveLoading(false);
        }
    }

    // Add Pass to Google Pay
    async function addToGooglePay(e : any) {
        
        e.preventDefault();
        setSaveLoading(true);

        if (!file && !qrCode) {
            setAddErrorMessage('noFileOrQrCode')
            setSaveLoading(false);
            return;
        }

        try {
            if (payloadBody) {

                console.log('> increment count');
                await incrementCount();

                console.log('> generatePass');
                const jwt = await GPayData.generatePass(payloadBody, selectedDose);

                if (payloadBody.dataUrl) {
                    try {
                        
                        localStorage.setItem(`receipt-${payloadBody.serialNumber}`, payloadBody.dataUrl);
                        console.log(`receipt-${payloadBody.serialNumber} saved`);

                    } catch (e) {
                        if (e.message.includes('quota')) {
                            
                            // clear old receipts and retry
                            console.info('clearing old receipts');
                            localStorage.clear();
                            localStorage.setItem(`receipt-${payloadBody.serialNumber}`, payloadBody.dataUrl);
                        }
                    }
                }

                const newUrl = `https://pay.google.com/gp/v/save/${jwt}`;
                console.log('> redirect to save Google Pass');

                setSaveLoading(false);
                window.location.href = newUrl;
            }
        } catch (e) {

            if (e) {
                console.error(e);
                Sentry.captureException(e);

                if (e.message) {
                    setAddErrorMessage(e.message);
                } else {
                    setAddErrorMessage("Unable to continue.");
                }
            } else {
                setAddErrorMessage("Unexpected error. Sorry.");
            }

            setSaveLoading(false);
        }
    }

    async function renderPhoto(payloadBody : PayloadBody, shouldRegister = false) {
        console.log('renderPhoto');
        if (!payloadBody) {
            console.log('no payload body');
            setAddErrorMessage('noFileOrQrCode');
            return;
        }

        try {
            console.log('beginning render');
            if (payloadBody.rawData.length > 0) {    
                // This is an SHC receipt, so do our SHC thing

                // need to clean up first
                if (document.getElementById('shc-qrcode').hasChildNodes()) {
                    document.getElementById('shc-qrcode').firstChild.remove();
                }

                document.getElementById('shc-pass-image').hidden = false;
                document.getElementById('shc-image-header').hidden = false;
                console.log('made canvas visible');

                await Photo.generateSHCPass(payloadBody, shouldRegister);
                console.log('generated blob');
            }
            console.log('done photo render');
        } catch (e) {
            Sentry.captureException(e);

            setAddErrorMessage(e.message);
        }        
    }

    async function refreshPhoto() {
        await renderPhoto(payloadBody, false);
    }

    const setDose = (e : any) => {
        setSelectedDose(e.target.value);
    }

    function checkBrowserType() {

        // if (isIPad13) {
        //     setAddErrorMessage('Sorry. Apple does not support the use of Wallet on iPad. Please use iPhone/Safari.');
        //     setIsDisabledAppleWallet(true);
        // } 
        // if (!isSafari && !isChrome) {
        //     setAddErrorMessage('Sorry. Apple Wallet pass can be added using Safari or Chrome only.');
        //     setIsDisabledAppleWallet(true);
        // }
        
        const uaIsiOS15 = getUA.includes('15_');
        const uaIsiOS16 = getUA.includes('16_');

        if (isIOS && ((!osVersion.startsWith('15') && (!osVersion.startsWith('16')) && !uaIsiOS15 && !uaIsiOS16))) {
            const message = `Not iOS15+ error: osVersion=${osVersion} UA=${getUA}`;
            console.warn(message);
            Sentry.captureMessage(message);
            setAddErrorMessage(`Sorry, iOS 15+ is needed for the Apple Wallet functionality to work with Smart Health Card (detected iOS ${osVersion}, browser ${browserName} ${browserVersion})`);
            setIsDisabledAppleWallet(true);
            return;
        } 

        //TODO: feature flagging

        // if (isIOS || isMacOs) {
        //     setIsDisabledFastLink(false);
        // }
                    console.log(osVersion);

        if (isMacOs) {
            setAddErrorMessage('iOSReminder')
            return;
        }

        if (isIOS && !isSafari) {
            setAddErrorMessage('safariSupportOnly');
            setIsDisabledAppleWallet(true);
            return;
        }

        if (isAndroid) {
            const majorVersion = parseInt(osVersion.split('.')[0]);
            console.log(`majorVersion=${majorVersion}`);
            if (majorVersion >= 8) {
                setIsDisabledGooglePay(false);
            } else {
                setAddErrorMessage('androidVersionError')
                setIsDisabledGooglePay(true);
            }
        } else {
            if (window.location.hostname !== 'localhost') {
                setIsDisabledGooglePay(true);
            }
        }
    }

    return (
        <div>
            <form className="space-y-5" id="form" onSubmit={addToWallet}>
                <Card step="1" heading={t('index:downloadReceipt')} content={
                    <div className="space-y-5">
                        <p>{t('index:visit')}</p>
                        <p><b>{t('index:reminderNotToRepeat')}</b></p>
                        <Dropdown label="Select Your Province" options={options} />
                    </div>
                }/>
                <Card step="2" heading={t('index:selectCertificate')} content={
                    <div className="space-y-5">
                        <p>{t('index:selectCertificateDescription')}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center justify-start">
                            <button
                                type="button"
                                onClick={showFileDialog}
                                className="h-20 bg-green-600 hover:bg-gray-700 text-white font-semibold rounded-md">
                                {t('index:openFile')}
                            </button>
                            <button
                                type="button"
                                onClick={isCameraOpen ? hideCameraView : showCameraView}
                                className="h-20 bg-green-600 hover:bg-gray-700 text-white font-semibold rounded-md">
                                {isCameraOpen ? t('index:stopCamera') : t('index:startCamera')}
                            </button>
                            <div id="spin" className={fileLoading ? undefined : "hidden"}>
                                <svg className="animate-spin h-5 w-5 ml-4" viewBox="0 0 24 24">
                                    <circle className="opacity-0" cx="12" cy="12" r="10" stroke="currentColor"
                                            strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor"
                                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                </svg>
                            </div>
                        </div>
                        <video id="cameraPreview"
                               className={`${isCameraOpen ? undefined : "hidden"} rounded-md w-full`}/>
                        <input type='file'
                               id='file'
                               accept="application/pdf,.png,.jpg,.jpeg,.gif,.webp"
                               ref={inputFile}
                               style={{display: 'none'}}
                        />
                        {(qrCode || file) &&
                        <div className="flex items-center space-x-1">
                            <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24"
                                 stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                            </svg>
                            <span className="w-full truncate">
                                {
                                    qrCode && t('index:foundQrCode')
                                }
                                {
                                    file && file.name
                                }
                            </span>
                        </div>
                        }
                        
                        {fileErrorMessages.map((message, i) =>
                            <Alert message={message} key={'error-' + i} type="error" />
                        )}
                    </div>
                }/>
                {!isDisabledFastLink && <Card step="3" heading='(Optional) Link a photo to your wallet pass' content={
                    <div className="space-y-5">
                        <p>The photo will be saved in your browser (as local & private storage). Your wallet pass will have a link to it for quick showing.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center justify-start">
                            <button
                                type="button"
                                onClick={showFile2Dialog}
                                className="h-20 bg-green-600 hover:bg-gray-700 text-white font-semibold rounded-md">
                                {t('index:openFile')}
                            </button>
                            <div id="spin2" className={file2Loading ? undefined : "hidden"}>
                                <svg className="animate-spin h-5 w-5 ml-4" viewBox="0 0 24 24">
                                    <circle className="opacity-0" cx="12" cy="12" r="10" stroke="currentColor"
                                            strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor"
                                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                </svg>
                            </div>
                        </div>
                        <input type='file'
                               id='file2'
                               accept="application/pdf,.png,.jpg,.jpeg,.gif,.webp"
                               ref={inputFile2}
                               style={{display: 'none'}}
                        />
                        {(file2) &&
                        <div className="flex items-center space-x-1">
                            <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24"
                                 stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                            </svg>
                            <span className="w-full truncate">
                                {
                                    file2 && file2.name
                                }
                            </span>
                        </div>
                        }
                        {fileErrorMessages.map((message, i) =>
                            <Alert message={message} key={'error-' + i} type="error" />
                        )}
                    </div>
                }/>
                }
                {showDoseOption && <Card step={isDisabledFastLink ? '4': '3'} heading={'Choose dose number'} content={
                    <div className="space-y-5">
                        <p>
                            {t('index:formatChange')}
                            <br /><br />
                            {t('index:saveMultiple')}
                        </p>
                        <link href="https://cdn.jsdelivr.net/npm/@tailwindcss/custom-forms@0.2.1/dist/custom-forms.css" rel="stylesheet"/>
                        <div className="block">
                            <div className="mt-2">
                                {payloadBody && Object.keys(payloadBody.receipts).map(key =>
                                    <div key={key}>
                                        <label className="inline-flex items-center">
                                            <input onChange={setDose} type="radio" className="form-radio" name="radio" value={key} checked={parseInt(key) == selectedDose} />
                                            <span className="ml-2">Dose {key}</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                } />}
                <Card step={showDoseOption ? (!isDisabledFastLink ? '5' : '4') : (!isDisabledFastLink ? '4': '3')} heading={t('index:addToWalletHeader')} content={
                    <div className="space-y-5">
                        <div>
                            <ul className="list-none">
                                <Check text={t('createdOnDevice')}/>
                                <Check text={t('piiNotSent')}/>
                                <Check text={t('openSourceTransparent')}/>
                            </ul>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center justify-items-stretch">
                            <button disabled={saveLoading || isDisabledAppleWallet} id="download" type="submit" value='applewallet' name='action'
                                 className={'outline-apple rounded-md ' + ((!payloadBody || saveLoading || isDisabledAppleWallet)? 'bg-gray-300 cursor-not-allowed':'bg-black cursor-pointer')}>
                                <div className="flex justify-center">
                                    <img style={{height: 40}} src="apple_wallet.svg" alt={t('index:addToWallet')}/>
                                </div>
                            </button>
                            <button id="addToGooglePay" type="button" disabled={saveLoading || isDisabledGooglePay} value='gpay' name='action' onClick={addToGooglePay}
                                className={'rounded-md ' + ((!payloadBody || saveLoading || isDisabledGooglePay)? 'bg-gray-300 cursor-not-allowed':'bg-black cursor-pointer')}>
                                    <div className="flex justify-center">
                                <img style={{height: 40}} src="gpay_light.svg" alt={t('index:addToGooglePay')}/>
                                </div>
                            </button>
                            <div id="spin" className={saveLoading ? undefined : "hidden"}>
                                <svg className="animate-spin h-5 w-5 ml-4" viewBox="0 0 24 24">
                                    <circle className="opacity-0" cx="12" cy="12" r="10" stroke="currentColor"
                                            strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor"
                                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                </svg>
                            </div>
                        </div>
                        {addErrorMessages.map((message, i) =>
                            <Alert message={message} key={'error-' + i} type="error" />
                        )}
                        <div id="shc-image-header" hidden>
                            <p><b>{t('index:saveVaccineCard')}</b></p>
                            <p>{t('index:refreshNote')}</p>
                            <br />
                            <button id="renderPhoto" type="button" disabled={saveLoading || !payloadBody} value='renderPhoto' name='action' onClick={refreshPhoto}
                                className=" bg-green-600 py-2 px-3 text-white font-semibold rounded-md disabled:bg-gray-400">
                                {t('index:refreshButton')}
                            </button>
                        </div>
                        <div id="shc-pass-image" style={{backgroundColor: "white", color: "black", fontFamily: 'Arial', fontSize: 10, width: '350px', padding: '10px', border: '1px solid', margin: '0px'}} hidden>
                            <table style={{verticalAlign: "middle"}}>
                                <tbody>
                                    <tr>
                                        <td><img src='shield-black.svg' width='50' height='50' /></td>
                                        <td style={{fontSize: 20, width: 280}}>
                                            <span style={{marginLeft: '11px', whiteSpace: 'nowrap'}}><b>COVID-19 Vaccination Card</b></span><br/>
                                            <span style={{marginLeft: '11px'}}><b id='shc-card-origin'></b></span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <br/>
                            <div style={{fontSize:14, textAlign: 'center'}}>
                                <span id='shc-card-name' ></span>&nbsp;&nbsp;&nbsp;&nbsp;(<span id='shc-card-dob'></span>)
                            </div>
                            <br/>
                            <table style={{textAlign:'center',width: '100%'}}>
                                <tbody>
                                    <tr><td id='shc-card-vaccine-name-1'></td><td id='shc-card-vaccine-name-2'></td></tr>
                                    <tr><td id='shc-card-vaccine-date-1'></td><td id='shc-card-vaccine-date-2'></td></tr>
                                    <tr id='extraRow1a' hidden><td id='shc-card-vaccine-name-3'></td><td id='shc-card-vaccine-name-4'></td></tr>
                                    <tr id='extraRow1b' hidden><td id='shc-card-vaccine-date-3'></td><td id='shc-card-vaccine-date-4'></td></tr>
                                </tbody>
                            </table>
                            <div id='shc-card-vaccine' style={{width:'63%', display:'block', marginLeft: 'auto', marginRight: 'auto'}}></div>
                            <div id='shc-qrcode' style={{width:'63%', display:'block', marginLeft: 'auto', marginRight: 'auto'}}></div>
                            <br/>
                        </div>
                        <div>{<a id="shc-pass-img-link" download="vaccination-card.png"><img id="shc-pass-img"/></a>}</div>
                    </div>
                }/>
                <Card step="?" heading={t('index:questions')} content={
                    <div className="space-y-5">
                        <p>{t('index:questionsNote')}</p>
                        <div>
                            <ul>
                                <Bullet text={t('index:question1')}/> 
                                <Bullet text={t('index:question2')}/>
                                <Bullet text={t('index:question3')}/>
                            </ul>
                        </div>
                        <div className="flex flex-row items-center justify-start">
                            <button id="faq-redirect" onClick={goToFAQ}
                                className=" bg-green-600 py-2 px-3 text-white font-semibold rounded-md disabled:bg-gray-400">
                                {t('index:visitFAQ')}
                            </button>
                            &nbsp;&nbsp;&nbsp;&nbsp;
                        </div>
                    </div>
                }/>
            </form>
        </div>
    )
}

export default Form;
