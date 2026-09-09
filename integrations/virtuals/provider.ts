import { AcpAgent, AcpApiClient, PrivyAlchemyEvmProviderAdapter, AssetToken, SseTransport, ACP_TESTNET_SERVER_URL } from '@virtuals-protocol/acp-node-v2';
import { base, baseSepolia } from '@account-kit/infra';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
for(const filename of ['.env','.env.integrations']){
  const path=resolve(projectRoot,filename);
  if(!existsSync(path)) continue;
  for(const line of readFileSync(path,'utf8').split(/\r?\n/)){
    const match=line.match(/^([^#=]+)=(.*)$/);
    if(match&&!process.env[match[1].trim()]) process.env[match[1].trim()]=match[2].trim();
  }
}

const required=['VIRTUALS_WALLET_ADDRESS','VIRTUALS_WALLET_ID','VIRTUALS_SIGNER_PRIVATE_KEY','SENTINEL_DASHBOARD','SENTINEL_WORKER_TOKEN'];
for(const name of required) if(!process.env[name]) throw new Error(`Missing ${name}`);
if(!process.env.VIRTUALS_SIGNER_PRIVATE_KEY!.startsWith('MIGH')||process.env.VIRTUALS_SIGNER_PRIVATE_KEY!.length<140) throw new Error('VIRTUALS_SIGNER_PRIVATE_KEY must be the base64 PKCS#8 P-256 authorization key copied from the agent Signers tab, not an EOA hex private key.');
const dashboard=process.env.SENTINEL_DASHBOARD!.replace(/\/$/,'');
const headers={authorization:`Bearer ${process.env.SENTINEL_WORKER_TOKEN}`,'content-type':'application/json'};
const development=(process.env.VIRTUALS_NETWORK||'development').toLowerCase()!=='production';
const serverUrl=development?ACP_TESTNET_SERVER_URL:undefined;
const chain=development?baseSepolia:base;
async function workspaceId(jobId:string){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(jobId)));return 'acp-'+Array.from(b.slice(0,16),x=>x.toString(16).padStart(2,'0')).join('')}
const agent=await AcpAgent.create({
  evmProvider:await PrivyAlchemyEvmProviderAdapter.create({walletAddress:process.env.VIRTUALS_WALLET_ADDRESS! as `0x${string}`,walletId:process.env.VIRTUALS_WALLET_ID!,signerPrivateKey:process.env.VIRTUALS_SIGNER_PRIVATE_KEY!,chains:[chain],serverUrl}),
  transport:new SseTransport({serverUrl}),
  api:new AcpApiClient({serverUrl}),
});

await agent.getMe();
console.log(`SYBIL authenticated with Virtuals on ${development?'development / Base Sepolia':'production / Base'}.`);

agent.on('entry',async(session:any,entry:any)=>{
  if(entry.kind==='message'&&entry.contentType==='requirement'&&session.status==='open'){
    const requirement=JSON.parse(entry.content);
    const response=await fetch(`${dashboard}/api/worker/acp`,{method:'POST',headers,body:JSON.stringify({jobId:String(session.jobId),repository:requirement.repository,branch:requirement.branch||'main',contracts:requirement.contracts})});
    if(!response.ok){await session.sendMessage(`SENTINEL rejected the requirement: HTTP ${response.status}`);return}
    await session.setBudget(AssetToken.usdc(0.01,session.chainId));
  }
  if(entry.kind==='system'&&entry.event.type==='job.funded'){
    const id=await workspaceId(String(session.jobId));
    for(let attempt=0;attempt<240;attempt++){
      const result=await fetch(`${dashboard}/api/worker/acp?id=${encodeURIComponent(id)}`,{headers}).then(r=>r.json()) as any;
      if(result.status==='watching'){await session.submit(JSON.stringify(result));return}
      if(result.status==='failed'){await session.submit(JSON.stringify({error:'Audit failed safely',...result}));return}
      await new Promise(resolve=>setTimeout(resolve,15000));
    }
    await session.submit(JSON.stringify({error:'Audit timed out before the one-hour SLA.'}));
  }
});
await agent.start(()=>console.log(`SYBIL Virtuals ACP provider listening on ${development?'development / Base Sepolia':'production / Base'}.`));
