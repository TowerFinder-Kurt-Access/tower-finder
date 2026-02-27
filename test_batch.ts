import { GeoapifyService } from './src/services/GeoapifyService';

async function main() {
    const res = await GeoapifyService.getBatchResult("835a54e6378040a799af2ece7d9208fe");
    console.log(JSON.stringify(res, null, 2).substring(0, 1000));
}

main().catch(console.error);
