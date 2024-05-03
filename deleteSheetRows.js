const SmartsheetClient = require('smartsheet');


const accessToken = process.env.SMARTSHEET_ACCESS_KEY;
const smartsheet = SmartsheetClient.createClient({ accessToken });
const sheetId = process.env.SMARTSHEET_SHEETID;


const deleteSheetRows = async (req, res) => {


    try {
        const result = await smartsheet.sheets.getSheet({ id: sheetId })

        if (result?.rows?.length > 0) {
            const rowIDs = result.rows?.map(row => row.id)

            const chunkSize = 300;

            const idChunks = [];
            for (let i = 0; i < rowIDs.length; i += chunkSize) {
                idChunks.push(rowIDs.slice(i, i + chunkSize));
            }

            for (const listID of idChunks) {

                const options = {
                    sheetId: sheetId,
                    rowId: listID
                };


                await smartsheet.sheets.deleteRow(options)

            }

            res.send(idChunks)
        } else {
            res.send("something went wrong")
        }

    } catch (err) {
        console.log(err);
    }

}


module.exports = deleteSheetRows