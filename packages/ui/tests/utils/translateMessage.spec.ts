import i18n from 'i18next';
import { translateMessage } from '../../src/utils/translateMessage';

describe('translateMessage', () => {
  it('renders a key the API sent through i18next', () => {
    const spy = jest.spyOn(i18n, 't');

    expect(translateMessage({ key: 'ERRORS.QUEUE_NOT_FOUND' })).toBe('ERRORS.QUEUE_NOT_FOUND');
    expect(spy).toHaveBeenCalledWith('ERRORS.QUEUE_NOT_FOUND', undefined);

    spy.mockRestore();
  });

  it('passes interpolation values along with the key', () => {
    const spy = jest.spyOn(i18n, 't');

    translateMessage({ key: 'ERRORS.STATUS_NOT_RETRIABLE', options: { status: 'active' } });

    expect(spy).toHaveBeenCalledWith('ERRORS.STATUS_NOT_RETRIABLE', { status: 'active' });

    spy.mockRestore();
  });

  // The message of a thrown error has no key to give, so it arrives already phrased.
  it('shows a plain string as it arrived', () => {
    expect(translateMessage('Redis connection lost')).toBe('Redis connection lost');
  });

  it('leaves an absent message absent', () => {
    expect(translateMessage(undefined)).toBeUndefined();
  });
});
