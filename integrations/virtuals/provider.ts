import { AcpAgent, AcpApiClient, PrivyAlchemyEvmProviderAdapter, AssetToken, SseTransport, ACP_TESTNET_SERVER_URL } from '@virtuals-protocol/acp-node-v2';
import { base, baseSepolia } from '@account-kit/infra';
import { createServer } from 'node:http';
const required=['VIRTUALS_WALLET_ADDRESS','VIRTUALS_WALLET_ID','VIRTUALS_SIGNER_PRIVATE_KEY','SENTINEL_DASHBOARD','SENTINEL_WORKER_TOKEN'];
for(const name of required) if(!process.env[name]) throw new Error(`Missing ${name}`);
if(!process.env.VIRTUALS_SIGNER_PRIVATE_KEY!.startsWith('MIGH')||process.env.VIRTUALS_SIGNER_PRIVATE_KEY!.length<140) throw new Error('VIRTUALS_SIGNER_PRIVATE_KEY must be the base64 PKCS#8 P-256 authorization key copied from the agent Signers tab, not an EOA hex private key.');
const dashboard=process.env.SENTINEL_DASHBOARD!.replace(/\/$/,'');
const headers={authorization:`Bearer ${process.env.SENTINEL_WORKER_TOKEN}`,'content-type':'application/json'};
const development=(process.env.VIRTUALS_NETWORK||'production').toLowerCase()==='development';
const serverUrl=development?ACP_TESTNET_SERVER_URL:undefined;
const chain=development?baseSepolia:base;
let virtualsStatus='starting';
const port=Number(process.env.PORT||3000);
createServer((request,response)=>{
  if(request.url!=='/health'){response.writeHead(404).end('Not found');return}
  response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({service:'sentinel-virtuals-provider',status:virtualsStatus,network:development?'development':'production'}));
}).listen(port,()=>console.log(`SENTINEL provider health endpoint listening on ${port}.`));
async function workspaceId(jobId:string){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(jobId)));return 'acp-'+Array.from(b.slice(0,16),x=>x.toString(16).padStart(2,'0')).join('')}
const agent=await AcpAgent.create({
  evmProvider:await PrivyAlchemyEvmProviderAdapter.create({walletAddress:process.env.VIRTUALS_WALLET_ADDRESS! as `0x${string}`,walletId:process.env.VIRTUALS_WALLET_ID!,signerPrivateKey:process.env.VIRTUALS_SIGNER_PRIVATE_KEY!,chains:[chain],serverUrl}),
  transport:new SseTransport({serverUrl}),
  api:new AcpApiClient({serverUrl}),
});

await agent.getMe();
virtualsStatus='authenticated';
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
await agent.start(()=>{virtualsStatus='listening';console.log(`SYBIL Virtuals ACP provider listening on ${development?'development / Base Sepolia':'production / Base'}.`)});
