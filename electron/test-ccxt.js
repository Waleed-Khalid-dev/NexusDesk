const ccxt = require('ccxt');

async function test() {
  try {
    const mexc = new ccxt.mexc({ options: { defaultType: 'swap' } });
    const f = await mexc.fetchFundingRates();
    console.log('MEXC Keys:', Object.keys(f).slice(0,3));
    if (Object.keys(f).length > 0) {
      console.log('Sample MEXC:', f[Object.keys(f)[0]]);
    }
  } catch(e) {
    console.error('MEXC Error:', e.message);
  }

  try {
    const bybit = new ccxt.bybit({ options: { defaultType: 'swap' } });
    const f = await bybit.fetchFundingRates();
    console.log('Bybit Keys:', Object.keys(f).slice(0,3));
    if (Object.keys(f).length > 0) {
      console.log('Sample Bybit:', f[Object.keys(f)[0]]);
    }
  } catch(e) {
    console.error('Bybit Error:', e.message);
  }

  try {
    const okx = new ccxt.okx({ options: { defaultType: 'swap' } });
    const f = await okx.fetchFundingRates();
    console.log('OKX Keys:', Object.keys(f).slice(0,3));
    if (Object.keys(f).length > 0) {
      console.log('Sample OKX:', f[Object.keys(f)[0]]);
    }
  } catch(e) {
    console.error('OKX Error:', e.message);
  }
}

test();
