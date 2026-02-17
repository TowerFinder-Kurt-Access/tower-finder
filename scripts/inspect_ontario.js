const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(process.cwd(), 'sources', '5. Ontario_Jan12_new.xlsx');
console.log(`Reading file from: ${filePath}`);

try {
    const workbook = xlsx.readFile(filePath);
    console.log(`Sheets found: ${workbook.SheetNames.join(', ')}`);

    for (const sheetName of workbook.SheetNames) {
        console.log(`\nProcessing sheet: ${sheetName}...`);
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        if (data.length > 0) {
            console.log('Headers:', data[0]);
            // Print first row to see data
            console.log('First row:', data[1]);
        }
    }
} catch (e) {
    console.error(e);
}
