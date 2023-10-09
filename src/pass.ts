import {toBuffer as createZip} from 'do-not-zip';

import {Constants} from "./constants";
import {Payload, PayloadBody, PassDictionary} from "./payload";
import {QrCode, PassPhotoCommon, getConfigData} from './passphoto-common';
import {COLORS} from "./colors";

const crypto = require('crypto');

interface SignData {
    PassJsonHash: string;
    useBlackVersion: boolean;
}

export class PassData {
    passTypeIdentifier: string = Constants.PASS_IDENTIFIER;
    teamIdentifier: string = Constants.TEAM_IDENTIFIER;
    sharingProhibited: boolean = true;
    voided: boolean = false;
    formatVersion: number = 1;
    logoText: string = Constants.NAME;
    organizationName: string = Constants.NAME;
    description: string = Constants.NAME;
    labelColor: string;
    foregroundColor: string;
    backgroundColor: string;
    serialNumber: string;
    barcodes: Array<QrCode>;
    barcode: QrCode;
    generic: PassDictionary;
    expirationDate: string;

    // Generates a sha1 hash from a given buffer
    private static getBufferHash(buffer: Buffer | string): string {
        const sha = crypto.createHash('sha1');
        sha.update(buffer);
        return sha.digest('hex');
    }

    private static async signWithRemote(signData: SignData): Promise<ArrayBuffer> {
        // Load API_BASE_URL form nextjs backend

        // console.log('signWithRemote');

        const config = await getConfigData();
        const apiBaseUrl = config.apiBaseUrl;
        // console.log(`${apiBaseUrl}/sign`);

        console.log(JSON.stringify(signData));

        const response = await fetch(`${apiBaseUrl}/sign`, {
            method: 'POST',
            headers: {
                'Accept': 'application/octet-stream',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(signData)
        })

        if (response.status !== 200) {
            throw Error('signatureFailed')
        }

        return await response.arrayBuffer()
    }

    static async generatePass(payloadBody: PayloadBody, numDose: number): Promise<Buffer> {

        // Create Payload
        try {
            
            const results = await PassPhotoCommon.preparePayload(payloadBody, false, numDose);
            const payload = results.payload;
            // Create pass data

            const pass: PassData = new PassData(results.payload, results.qrCode);

            if (!pass.expirationDate) {
                delete pass['expirationDate'];
            }
            
            // Create new zip
            const zip = [] as { path: string; data: Buffer | string }[];

            // Adding required fields

            // console.log(pass);

            // Create pass.json
            const passJson = JSON.stringify(pass);

            // Add pass.json to zip
            zip.push({path: 'pass.json', data: Buffer.from(passJson)});

            // Add Images to zip
            zip.push({path: 'icon.png', data: payload.img1x})
            zip.push({path: 'icon@2x.png', data: payload.img2x})
            zip.push({path: 'logo.png', data: payload.img1x})
            zip.push({path: 'logo@2x.png', data: payload.img2x})

            // Adding manifest
            // Construct manifest
            const manifestJson = JSON.stringify(
                zip.reduce(
                    (res, {path, data}) => {
                        res[path] = PassData.getBufferHash(data);
                        return res;
                    },
                    {},
                ),
            );

            // console.log(manifestJson);

            // Add Manifest JSON to zip
            zip.push({path: 'manifest.json', data: Buffer.from(manifestJson)});

            // Create pass hash
            const passHash = PassData.getBufferHash(Buffer.from(passJson));

            const useBlackVersion = (payload.backgroundColor == COLORS.WHITE);

            // Sign hash with server
            const manifestSignature = await PassData.signWithRemote({
                PassJsonHash: passHash,
                useBlackVersion: useBlackVersion,
            });

            // Add signature to zip
            zip.push({path: 'signature', data: Buffer.from(manifestSignature)});

            return createZip(zip);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    private constructor(payload: Payload, qrCode: QrCode) {
        this.labelColor = payload.labelColor;
        this.foregroundColor = payload.foregroundColor;
        this.backgroundColor = payload.backgroundColor;
        this.serialNumber = payload.serialNumber; // Generate random UUID v4
        this.barcodes = [qrCode];
        this.barcode = qrCode;
        this.generic = payload.generic;
        this.expirationDate = payload.expirationDate;
        
        // Update our pass name if this is an SHC pass
        if (payload.rawData.length > 0) {
            const newPassTitle = `${Constants.NAME} - ${payload.shcReceipt.cardOrigin}`;
            this.logoText = newPassTitle;
            this.organizationName = newPassTitle;
            this.description = newPassTitle;
        }
    }
}
