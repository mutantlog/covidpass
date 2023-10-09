import {Constants} from "./constants";
import {COLORS} from "./colors";
import link from "next/link";

export class Receipt {
    constructor(public name: string, public vaccinationDate: string, public vaccineName: string, 
        public dateOfBirth: string, public numDoses: number, public organization: string) {};
}

export interface HashTable<T> {
    [key: string]: T;
}

// QR CODE NEW FORMAT:
// * Origin jurisdiction
// * Person's name
// * NOTHING ELSE ON THE CARD TO ENCOURAGE SCANNING IT TO GET DATA (this is what QC does, and what BC mostly does; other jurisdictions add more data, but that encourages bad behaviour)

export class SHCReceipt {
    constructor(public name: string, public dateOfBirth: string, public cardOrigin: string, 
        public issuer: string, public vaccinations: SHCVaccinationRecord[]) {};
}

export class SHCVaccinationRecord {
    constructor(public vaccineName: string, public vaccinationDate: string, 
        public organization: string) {};
}

interface Field {
    key: string;
    label: string;
    value?: string;
    textAlignment?: string;
    attributedValue?: string;
}

export interface PassDictionary {
    headerFields: Array<Field>;
    primaryFields: Array<Field>;
    secondaryFields: Array<Field>;
    auxiliaryFields: Array<Field>;
    backFields: Array<Field>;
}

export interface PayloadBody {
    rawData: string;
    receipts: HashTable<Receipt>;
    shcReceipt: SHCReceipt;
    dataUrl?: string;
    extraUrl?: string;
    serialNumber?: string;
}

export class Payload {

    receipts: HashTable<Receipt>;
    shcReceipt: SHCReceipt;
    rawData: string;
    dataUrl?: string;
    extraUrl?: string;
    backgroundColor: string;
    labelColor: string;
    foregroundColor: string;
    img1x: Buffer;
    img2x: Buffer;
    serialNumber: string;
    generic: PassDictionary;
    expirationDate: string;

    constructor(body: PayloadBody, numDose: number = 0) {

        this.receipts = body.receipts;
        this.shcReceipt = body.shcReceipt;
        this.rawData = body.rawData;
        this.dataUrl = body.dataUrl;
        this.extraUrl = body.extraUrl;
        this.serialNumber = body.serialNumber;

        this.generic = {
            headerFields: [],
            primaryFields: [],
            secondaryFields: [],
            auxiliaryFields: [],
            backFields: []
        }

        if (body.rawData.length > 0) {
            processSHCReceipt(body.shcReceipt, this.generic);
            this.backgroundColor = COLORS.WHITE;
            this.labelColor = COLORS.BLACK;
            this.foregroundColor = COLORS.BLACK;
            this.img1x = Constants.img1xBlack;
            this.img2x = Constants.img2xBlack;

            if (this.dataUrl) {
                let displayLocallyStoredPDFUrl = window.location.href + "displayLocallySavedItem.html?item=receipt&serialNumber=" + body.serialNumber;  
                const attributedValue = `<a href="${displayLocallyStoredPDFUrl}">View Receipt</a>`;
                
                this.generic.backFields.push({
                    key: "original",
                    label: "Original receipt (saved locally in Safari)",
                    attributedValue: attributedValue
                });
            }

            if (this.extraUrl) {
                let extraUrl = window.location.href + "displayLocallySavedItem.html?item=extra&serialNumber=" + body.serialNumber; ;  
                const attributedValue = `<a href="${extraUrl}">View Extra Info</a>`;
                this.generic.backFields.push({
                    key: "extra",
                    label: "Extra info (saved locally in Safari)",
                    attributedValue: attributedValue
                });
            }

        }
    }
}

function processSHCReceipt(receipt: SHCReceipt, generic: PassDictionary) {

    console.log(`processing receipt for origin ${receipt.cardOrigin}`);

    if (generic.primaryFields.length == 0) {
        // const lastReceiptIndex = receipt.vaccinations.length - 1
        // const mostRecentReceipt = receipt.vaccinations[lastReceiptIndex];
        // const vaccineName = mostRecentReceipt.vaccineName.substring(0,1).toUpperCase() + mostRecentReceipt.vaccineName.substring(1).toLowerCase();
        // const value = `#${lastReceiptIndex + 1} - ${vaccineName}`;
        generic.primaryFields.push(
            {
                key: "name",
                label: 'Name',
                value: receipt.name
            }
        );
    }

    // generic.auxiliaryFields.push({
    //     key: "details",
    //     label: "Note on 4+ doses in Ontario",
    //     value: "QR code is encoded with most recent 3 doses only."
    // });

    generic.secondaryFields.push({
        key: "date-of-birth",
        label: "Date of Birth",
        value: receipt.dateOfBirth    
    });

    // reverse order so the most recent is first
    
    for (let i = receipt.vaccinations.length - 1; i >= 0 ; i--) {

        generic.auxiliaryFields.push(
            {
                key: 'vaccine' + (i+1),
                label: `${receipt.vaccinations[i].vaccineName}`,
                value: receipt.vaccinations[i].vaccinationDate
            }
        );
        generic.backFields.push(
            {
                key: 'vaccine' + (i+1),
                label: `${receipt.vaccinations[i].vaccineName}`,
                value: `${receipt.vaccinations[i].vaccinationDate} in ${receipt.vaccinations[i].organization}`
            }
        )

    }
}
