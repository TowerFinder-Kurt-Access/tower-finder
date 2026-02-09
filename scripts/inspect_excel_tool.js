const xlsx = require('xlsx');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
    console.error('Please provide a file path');
    process.exit(1);
}

const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

try {
    const workbook = xlsx.readFile(absolutePath);
    console.log(`File: ${path.basename(absolutePath)}`);
    console.log('Sheets found:', workbook.SheetNames);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        // Read first few rows to get headers and sample
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        if (data && data.length > 0) {
            console.log('Headers:', data[0]);
        } else {
            console.log('(Empty sheet)');
        }
    });

} catch (error) {
    console.error('Error reading excel:', error);
}
