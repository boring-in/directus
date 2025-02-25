import fs from "fs";
import axios from "axios";
import { xml2js } from "xml-js";

export class PrestashopUtility {
    async getPrestashopJson(domain, consumerKey, endpoint, id) {
        let convert = xml2js;
        let response = await axios.get(`https://${consumerKey}@${domain}/api/${endpoint}/${id}`);
        let responseJson = convert(response.data, {compact: true, spaces: 4});
        return responseJson;
    }

    loggerToFile(message) {
        let date = new Date();
        let dateString = date.getDate() + "-" + date.getMonth() + "-" + date.getFullYear();
        let timeString = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
        let logString = dateString + " " + timeString + " " + message + "\n";
        
        fs.appendFile("prestashopEventLog.txt", logString, (err) => {
            if(err) {
                console.log(err);
            }
        });
    }

    secondloggerToFile(message) {
        let date = new Date();
        let dateString = date.getDate() + "-" + date.getMonth() + "-" + date.getFullYear();
        let timeString = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
        let logString = dateString + " " + timeString + " " + message + "\n";
        
        fs.appendFile("orderImportEventLog.txt", logString, (err) => {
            if(err) {
                console.log(err);
            }
        });
    }

    orderStatusMap(orderState) {
        const statusMap = {
            1: 20,   // Awaiting check payment
            2: 5,    // Payment accepted
            3: 6,    // Processing in progress
            4: 39,   // Shipped
            5: 38,   // Delivered
            6: 4,    // Canceled
            8: 29,   // Error
            9: 32,   // On backorder (not paid)
            10: 25,  // Awaiting bank wire payment
            11: 24,  // Awaiting PayPal payment
            12: 14,  // Remote payment accepted
            13: 15,  // On backorder (paid)
            17: 13,  // Awaiting credit card payment
            18: 47,  // Awaiting COD validation
            19: 10,  // Awaiting transfer payment
            20: 37,  // Awaiting delivery
            21: 11,  // Awaiting validation
            22: 23,  // Being prepared
            23: 38,  // Being delivered
            24: 19,  // Payment error
            25: 31,  // Payment declined
            26: 30,  // Refunded
            27: 16,  // Return pending
            28: 21,  // Return completed
            29: 41,  // Return denied
            30: 42,  // Return canceled
            31: 34,  // Awaiting pickup
            32: 43,  // Ready for pickup
            34: 7,   // Partially shipped
            35: 8,   // Partially delivered
            37: 18,  // Partially refunded
            38: 27,  // Awaiting confirmation
            39: 33,  // Payment pending
            40: 22,  // Processing
            41: 36,  // On hold
            42: 12,  // Completed
            43: 26,  // Pending review
            44: 44,  // Pending fulfillment
            45: 45,  // Pending payment
            46: 28,  // Pending cancellation
            47: 46   // Awaiting shipment
        };

        return statusMap[orderState] || 1; // Default to 1 if status not found
    }
}
