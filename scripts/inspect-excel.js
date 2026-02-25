const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../sources/5. Ontario_Jan12   Feb 24.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Headers:");
console.log(JSON.stringify(data[0], null, 2));

console.log("\nFirst row:");
console.log(JSON.stringify(data[1], null, 2));
