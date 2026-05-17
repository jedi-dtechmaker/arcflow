const { privateKeyToAccount } = require('viem/accounts');
const key = '0xe119d1649152ea6baea5866f2ce4d0d4d4473022fdb26cd926c13ff7446e5237';
const account = privateKeyToAccount(key);
console.log('ADDR=' + account.address);
