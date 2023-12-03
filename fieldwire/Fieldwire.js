const fs = require('fs');
const SmartsheetClient = require('smartsheet');
const mongoose = require('mongoose'); // Add this line to import mongoose
const accessToken = process.env.SMARTSHEET_ACCESS_KEY;
const smartsheet = SmartsheetClient.createClient({ accessToken });
const sheetId = process.env.SMARTSHEET_SHEETID;
const MOGODB_URI=process.env.MOGODB_URI;
// const { MongoClient } = require('mongodb')




const SmartsheetData = async () => {
    try {
     
        await mongoose.connect(MOGODB_URI);

        
        const collection = mongoose.connection.collection('FieldWire');

       
        const result = await smartsheet.sheets.getSheet({ id: sheetId });
        // console.log('result',result)

        
        const rowsData = result.rows.map(row => {
            const rowData = {};

            for (const prop in row) {
                // Exclude the 'cells' property
                if (prop !== 'cells') {
                    rowData[prop] = row[prop];
                }
            }
            // row.cells.forEach(cell => {
            //     const column = result.columns.find(column => column.id === cell.columnId);
            //     if (column) {
            //         rowData[column.title] = cell.value;
            //     } else {
            //         // If column is not found, set the entire column data to null
            //         result.columns.forEach(column => {
            //             rowData[column.title] = null;
            //         });
            //         // Alternatively, you can set the value to null for the specific cell.columnId
            //         // rowData[cell.columnId] = null;
            //     }
            // });

            result.columns.forEach(column => {
                const cell = row.cells.find(cell => cell.columnId === column.id);
                rowData[column.title] = cell ? cell.value : null;
            });
        

            return rowData;
        });

        // const jsonData = JSON.stringify(rowsData, null, 2);

        // fs.writeFileSync('rowsData.json', jsonData);

        
        await collection.insertMany(rowsData);

        console.log('Rows data has been saved to MongoDB');

        const mongodbData = await collection.find({}).toArray();

        
        const mismatchedData = findMismatchedData(rowsData, mongodbData, 'id');

        if (mismatchedData.length === 0) {
            console.log('Smartsheet and MongoDB data match!');
        } else {
            console.log('Smartsheet and MongoDB data do not match. Mismatched items:', mismatchedData);
        }
    } catch (error) {
        console.error(error);
        console.log('Something went wrong');
    } finally {
        
        await mongoose.connection.close();
    }
};


const findMismatchedData = (smartsheetData, mongodbData, id) => {
    const smartsheetMap = new Map(smartsheetData.map(item => [item[id], item]));
    const mongodbMap = new Map(mongodbData.map(item => [item[id], item]));

    const mismatchedData = [];

    // Find mismatched items based on the identifier
    for (const [id, smartsheetItem] of smartsheetMap) {
        const mongodbItem = mongodbMap.get(id);
    
        if (!mongodbItem || !deepCompare(smartsheetItem, mongodbItem)) {
            mismatchedData.push({ smartsheet: smartsheetItem, mongodb: mongodbItem });
        }
    }
    

    // Find items in MongoDB that are not present in Smartsheet
    for (const [id, smartsheetItem] of smartsheetMap) {
        const mongodbItem = mongodbMap.get(id);
    
        if (!mongodbItem || !deepCompare(smartsheetItem, mongodbItem)) {
            mismatchedData.push({ smartsheet: smartsheetItem, mongodb: mongodbItem });
        }
    }
    return mismatchedData;
};


function deepCompare(obj1, obj2) {
    // Check if both values are null or undefined
    if (obj1 === null || obj1 === undefined) {
        return obj2 === null || obj2 === undefined;
    }

    // Special handling for "_id" property
    if (obj1?._id?.$oid && obj2 instanceof ObjectId) {
        return obj1._id.$oid === obj2.toString();
    }

    // Check if both values are of the same type
    if (typeof obj1 !== typeof obj2) {
        return false;
    }

    // If both objects are arrays, compare their elements
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) {
            return false;
        }

        for (let i = 0; i < obj1.length; i++) {
            if (!deepCompare(obj1[i], obj2[i])) {
                return false;
            }
        }

        return true;
    }

    // If both objects are objects, compare their properties
    if (typeof obj1 === 'object' && obj1 !== null && typeof obj2 === 'object' && obj2 !== null) {
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        if (keys1.length !== keys2.length) {
            return false;
        }

        for (const key of keys1) {
            if (!keys2.includes(key) || !deepCompare(obj1[key], obj2[key])) {
                return false;
            }
        }

        return true;
    }

    // Otherwise, compare values
    return obj1 === obj2;
}



module.exports = SmartsheetData;



