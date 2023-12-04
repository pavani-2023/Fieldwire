const express = require('express');
const app = express();
require('dotenv').config()


const port = process.env.PORT || 8000;

const SmartsheetData= require("./Fieldwire")

app.get('/',SmartsheetData );

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});