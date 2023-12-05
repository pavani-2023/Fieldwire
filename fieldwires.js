const fs = require('fs');
const SmartsheetClient = require('smartsheet');
const mongoose = require('mongoose'); // Add this line to import mongoose
const accessToken = process.env.SMARTSHEET_ACCESS_KEY;
const smartsheet = SmartsheetClient.createClient({ accessToken });
const sheetId = process.env.SMARTSHEET_SHEETID;
const MOGODB_URI=process.env.MOGODB_URI;


// const { MongoClient } = require('mongodb')




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
    
    const jsonsData = JSON.stringify( mismatchedData , null, 2);

    fs.writeFileSync('mismatchedData.json', jsonsData);

    return mismatchedData;
};




function deepCompare(obj1, obj2, path = '') {
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
        // console.log(`Type mismatch at path ${path}: ${typeof obj1} !== ${typeof obj2}`);
        return false;
    }

    // If both objects are arrays, compare their elements
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) {
            // console.log(`Array length mismatch at path ${path}: ${obj1.length} !== ${obj2.length}`);
            
            return false;
        }

        for (let i = 0; i < obj1.length; i++) {
            if (!deepCompare(obj1[i], obj2[i], `${path}[${i}]`)) {
                return false;
            }
        }

        return true;
    }

    

    if (typeof obj1 === 'object' && obj1 !== null && typeof obj2 === 'object' && obj2 !== null) {
        const keys1 = Object.keys(obj1).filter(key => key !== '_id'); // Exclude '_id'
        const keys2 = Object.keys(obj2).filter(key => key !== '_id');

        if (keys1.length !== keys2.length) {
            
            // Log the keys themselves
            // console.log(`Keys at path ${path} in obj1: ${keys1}`);
            // console.log(`Keys at path ${path} in obj2: ${keys2}`);
            
            return false;
        }

        for (const key of keys1) {
            if (!keys2.includes(key) || !deepCompare(obj1[key], obj2[key], `${path}.${key}`)) {
                return false;
            }
        }

        return true;
    }
    // Otherwise, compare values
    if (obj1 !== obj2) {
        console.log(`Value mismatch at path ${path}: ${obj1} !== ${obj2}`);
        return false;
    }

    return true;
}

const clearMismatchedDataFile = () => {
    fs.unlinkSync('mismatchedData.json');
    console.log('Mismatched data file cleared.');
};

const SmartsheetData = async () => {
    try {
        await mongoose.connect(MOGODB_URI);


        const collection = mongoose.connection.collection('FieldWire');

        // Check if there is any data in the MongoDB collection
        const hasDataInDB = await collection.countDocuments() > 0;

        if (hasDataInDB) {
            clearMismatchedDataFile();
            console.log('Data already exists in MongoDB. Checking for mismatches...');

            // Retrieve data from MongoDB
            
 
            const mongodbData = await collection.find({}).toArray();

            // Retrieve data from Smartsheet API
            const result = await smartsheet.sheets.getSheet({ id: sheetId });
            // console.log(result);

            const rowsData = result.rows.map(row => {
                const rowData = {};
    
                for (const prop in row) {
                    // Exclude the 'cells' property
                    if (prop !== 'cells') {
                        rowData[prop] = row[prop];
                    }
                }
                
                result.columns.forEach(column => {
                    const cell = row.cells.find(cell => cell.columnId === column.id);
                    rowData[column.title] = cell?.value ? cell.value : null;
                });
            
                return rowData;
            });

            const jsonData = JSON.stringify(rowsData, null, 2);
            fs.writeFileSync('rowsData.json', jsonData);
            // console.log('data saved to rowsData.jsonfile')

            // Find mismatched items
            
            const mismatchedData = findMismatchedData(rowsData, mongodbData, 'Task ID');

            if (mismatchedData.length === 0) {
                console.log('Smartsheet and MongoDB data match!');
            } else {
                console.log('Smartsheet and MongoDB data do not match.');
            }

           

            // // Update mismatched data in MongoDB
            // for (const mismatchedItem of mismatchedData) {
            //     const smartsheetItem = mismatchedItem.smartsheet;
            //     const mongodbItem = mismatchedItem.mongodb;
            //     const filter = { id: smartsheetItem.id };
    
            //     // Compare objects without considering the "_id" field
            //     const hasChanged = !deepCompare(smartsheetItem, mongodbItem);
    
            //     if (hasChanged) {
            //         // Data has changed, update it
            //         await collection.updateOne(filter, { $set: smartsheetItem });
            //         // console.log(`Mismatched data with id ${smartsheetItem.id} updated in MongoDB:`);
                    
            //         //  // Log key-value pairs of mismatched data
            //         //  hasChanged.forEach(key => {
            //         //     console.log(`  ${key}: ${smartsheetItem[key]}`);
            //         // });
                    
            //     } 
                
            // }
            // console.log('mismatched data is updated')
            // clearMismatchedDataFile ();

            for (const mismatchedItem of mismatchedData) {
                const smartsheetItem = mismatchedItem.smartsheet;
                const mongodbItem = mismatchedItem.mongodb;
                const filter = { id: smartsheetItem.id };
            
                // Compare objects property by property without considering the "_id" field
                const changedProperties = Object.keys(smartsheetItem).filter(key => {
                    return smartsheetItem[key] !== mongodbItem[key];
                });
            
                if (changedProperties.length > 0) {
                    // Data has changed, update it
                    await collection.updateOne(filter, { $set: smartsheetItem });
                    
                    // Log only the key-value pairs of changed properties
                    changedProperties.forEach(key => {
                        console.log(`  ${key}: ${smartsheetItem[key]}`);
                    });
                } 
            }
            
            console.log('Mismatched data updates completed');
            // clearMismatchedDataFile();



            
            

        } else {
            // No data in MongoDB, proceed with the API call and data insertion logic

            await mongoose.connect(MOGODB_URI);


            const collection = mongoose.connection.collection('FieldWire');

             
            const result = await smartsheet.sheets.getSheet({ id: sheetId });

            const rowsData = result.rows.map(row => {
                const rowData = {};
    
                for (const prop in row) {
                    // Exclude the 'cells' property
                    if (prop !== 'cells') {
                        rowData[prop] = row[prop];
                    }
                }

                
                result.columns.forEach(column => {
                    const cell = row.cells.find(cell => cell.columnId === column.id);
                    rowData[column.title] = cell?.value ? cell.value : null;
                });
               
                
    
                return rowData;
            });


            await collection.insertMany(rowsData);

            const jsonData = JSON.stringify(rowsData, null, 2);
            fs.writeFileSync('rowsData.json', jsonData);
            console.log('Rows data has been saved to MongoDB');
        }
        
    } catch (error) {
        console.error(error);
        console.log('Something went wrong');
    } finally {
        await mongoose.connection.close();
    }
};



module.exports = SmartsheetData;



