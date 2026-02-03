const xlsx = require('xlsx');
const path = 'East Coast (PEI, NB, NFLD)_Jan27.xlsx';

try {
    const workbook = xlsx.readFile(path);
    console.log('Sheets found:', workbook.SheetNames);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        // Read first few rows to get headers and sample
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        if (data && data.length > 0) {
            console.log('Headers:', data[0]);
            console.log('Row 1 sample:', data[1]);
            console.log(`Total rows: ${data.length}`);
        } else {
            console.log('(Empty sheet)');
        }
    });

} catch (error) {
    console.error('Error reading excel:', error);
}
