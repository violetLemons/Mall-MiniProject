const { confirmPayment } = require('./commerce');
exports.confirmOrderPaymentSuccess = (db, command, evidence) => confirmPayment(db, evidence);
