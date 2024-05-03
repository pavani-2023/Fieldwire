const express = require('express');
const app = express();
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config()


const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const getFieldWireData = require('./fieldwireApi');
//const deleteSheetRows = require('./deleteSheetRows');

// app.get('/', getFieldWireData);
// app.delete('/', deleteSheetRows);

// cron.schedule('*/2 * * * *', () => {
//     console.log('running a task every minute', getFieldWireData);
// });

cron.schedule('30 3,7 * * *', async () => {
    await getFieldWireData()
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});