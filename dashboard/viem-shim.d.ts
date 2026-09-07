declare module 'viem' {
  export function createPublicClient(config: any): any;
  export function createWalletClient(config: any): any;
  export function custom(provider: any): any;
  export function http(url?: string): any;
}
declare module 'viem/chains' { export const baseSepolia: { id:number; [key:string]:any }; }
