export class PartnerUnavailableError extends Error {
  constructor(message = 'Transfers are unavailable until an approved partner is configured.') {
    super(message);
    this.name = 'PartnerUnavailableError';
    this.code = 'PARTNER_NOT_CONFIGURED';
    this.status = 503;
  }
}

/**
 * Server-side boundary for the future issuer/authorized-provider integration.
 * Replace this implementation only after partner approval and production review.
 */
export class UnconfiguredPartnerProvider {
  async getStatus() {
    return {
      ready: false,
      name: null,
      message: 'Transfers are paused while we connect an approved bank or card issuer.',
    };
  }

  async createAccountLink() {
    throw new PartnerUnavailableError('Account linking is unavailable until a partner is configured.');
  }

  async createCardLink() {
    throw new PartnerUnavailableError('Secure card linking is unavailable until an approved partner is configured.');
  }

  async listCards() {
    throw new PartnerUnavailableError('Card wallet is unavailable until secure user sessions and an approved partner are configured.');
  }

  async quoteTransfer(_request) {
    throw new PartnerUnavailableError('A live partner quote is required before a transfer can be requested.');
  }

  async createTransfer(_request) {
    throw new PartnerUnavailableError();
  }

  async getTransfer(_transferId) {
    throw new PartnerUnavailableError('Transfer status is unavailable until a partner and secure user session are configured.');
  }

  async reverseTransfer(_transferId, _request) {
    throw new PartnerUnavailableError('Reversals are unavailable until an approved partner is configured.');
  }

  async handleWebhook(_request) {
    throw new PartnerUnavailableError('Partner notifications are not enabled.');
  }

  async listTransfers() {
    throw new PartnerUnavailableError('Transfer history is unavailable until a partner and secure user session are configured.');
  }
}
