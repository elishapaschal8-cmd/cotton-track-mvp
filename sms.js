async function sendSms({ phone, amount, transactionRef }) {
  const mode = (process.env.COTTON_TRACK_SMS_MODE || 'sandbox').toLowerCase();

  if (mode === 'fail') {
    return {
      status: 'FAILED',
      message: 'SMS provider failed',
      error: 'Provider unavailable'
    };
  }

  if (mode === 'sandbox' || !process.env.AFRICAS_TALKING_USERNAME || !process.env.AFRICAS_TALKING_API_KEY) {
    return {
      status: 'SENT',
      message: `Receipt sent to ${phone} for ${transactionRef}.`,
      provider: 'Africa\'s Talking Sandbox'
    };
  }

  try {
    const response = await fetch('https://api.sandbox.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'apiKey': process.env.AFRICAS_TALKING_API_KEY
      },
      body: new URLSearchParams({
        username: process.env.AFRICAS_TALKING_USERNAME,
        to: phone,
        message: `Cotton Track receipt ${transactionRef}. Total: TZS ${Number(amount).toLocaleString()}`
      })
    });

    if (!response.ok) {
      throw new Error('SMS provider rejected request');
    }

    return {
      status: 'SENT',
      message: `Receipt sent to ${phone}.`,
      provider: 'Africa\'s Talking Sandbox'
    };
  } catch (error) {
    return {
      status: 'FAILED',
      message: 'SMS provider failed',
      error: error.message || 'Provider unavailable'
    };
  }
}

export { sendSms };
