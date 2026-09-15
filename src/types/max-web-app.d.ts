interface MaxMiniAppBridge {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  openMaxLink?: (url: string) => void;
}

interface Window {
  WebApp?: MaxMiniAppBridge;
}
