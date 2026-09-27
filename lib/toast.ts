import toastLib from 'react-hot-toast';

/**
 * Toast wrapper that dismisses any visible toast before showing a new one,
 * so only one toast is shown at a time.
 */
const toast = {
  success: (message: string, options?: Parameters<typeof toastLib.success>[1]) => {
    toastLib.dismiss();
    return toastLib.success(message, options);
  },
  error: (message: string, options?: Parameters<typeof toastLib.error>[1]) => {
    toastLib.dismiss();
    return toastLib.error(message, options);
  },
  info: (message: string, options?: Parameters<typeof toastLib>[1]) => {
    toastLib.dismiss();
    return toastLib(message, options);
  },
  loading: (message: string, options?: Parameters<typeof toastLib.loading>[1]) => {
    toastLib.dismiss();
    return toastLib.loading(message, options);
  },
  dismiss: (toastId?: string) => toastLib.dismiss(toastId),
  promise: toastLib.promise,
  custom: toastLib.custom,
};

export default toast;
