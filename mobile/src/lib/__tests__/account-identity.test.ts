import {
  getAccountEmailLabel,
  isApplePrivateRelayEmail,
} from '../account-identity';

describe('Apple private relay identity', () => {
  it('recognizes legacy Apple relay addresses', () => {
    expect(isApplePrivateRelayEmail('user@privaterelay.appleid.com')).toBe(true);
  });

  it('recognizes the current Apple private email domain', () => {
    expect(isApplePrivateRelayEmail('user@private.icloud.com')).toBe(true);
  });

  it('keeps the supplied email visible while labeling its privacy source', () => {
    expect(getAccountEmailLabel('user@privaterelay.appleid.com')).toBe(
      'Account email · Private via Apple',
    );
    expect(getAccountEmailLabel('person@example.com')).toBe('Account email');
  });
});
