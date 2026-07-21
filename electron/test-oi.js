const intel = require('./market-intel.cjs');
async function test() {
  const bybit = await intel.getOpenInterestData('bybit');
  console.log('Bybit:', bybit.length > 0 ? bybit[0] : 'None');
  const mexc = await intel.getOpenInterestData('mexc');
  console.log('MEXC:', mexc.length > 0 ? mexc[0] : 'None');
}
test();
