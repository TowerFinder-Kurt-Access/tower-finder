const xlsx = require('xlsx');
const path = 'East Coast (PEI, NB, NFLD)_Jan27.xlsx';

try {
    const workbook = xlsx.readFile(path);
    const sheetName = workbook.SheetNames[0]; // Just check first sheet
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log('All column headers:');
    console.log(data[0]);
    console.log('\nFirst data row:');
    console.log(data[1]);
} catch (error) {
    console.error('Error reading excel:', error);
}
