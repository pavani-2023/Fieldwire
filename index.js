const express = require('express');
const app = express();
require('dotenv').config()


const port = process.env.PORT || 8080;

// const SmartsheetData= require("./Fieldwire2")
const SmartsheetData= require("./fieldwires")

app.get('/',SmartsheetData );

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});