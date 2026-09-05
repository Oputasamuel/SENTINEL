import { ArrowDownRight, ArrowRight, BrainCircuit, Check, Crosshair, ShieldCheck, Terminal } from 'lucide-react';
import { PrivyEntryButton } from '@/app/privy-controls';


const steps = [
  ['01', 'DROP THE TARGET', 'Paste a public GitHub repository. SENTINEL maps its Solidity attack surface.'],
  ['02', 'SELECT CONTRACTS', 'Choose the exact .sol files you want Pashov’s specialist agents to tear apart.'],
  ['03', 'LOCK THE MEMORY', 'Every accepted or manual finding becomes durable SYBIL context for that contract.'],
  ['04', 'WATCH THE FIX', 'Daily checks follow the repository and alert you when a vulnerability changes state.'],
];

export default function Home() {
  return <div className="cyber-landing"><div className="noise" aria-hidden="true"/>
    <header className="cyber-nav"><a href="/" className="cyber-brand"><span className="brand-glyph">S:</span><b>SENTINEL</b><em>SECURITY NODE</em></a><nav><a href="#protocol">PROTOCOL</a><a href="#memory">MEMORY</a><a href="#network">NETWORK</a></nav><PrivyEntryButton/></header>
    <main className="cyber-main"><section className="cyber-hero"><div className="cyber-copy"><p className="terminal-kicker">[ AUTONOMOUS SMART-CONTRACT DEFENSE ]</p><h1>HUNT THE BUG.<br/><span>REMEMBER THE</span><br/>ATTACK PATH.</h1><div className="hero-bottom"><PrivyEntryButton/><p>Pashov finds it. SYBIL remembers it.<br/>SENTINEL watches until the code is clean.</p></div></div>
      <div className="core-stage" aria-label="SYBIL security core"><img src="/sentinel-core-3d.png" alt="Obsidian mechanical brain and vault core glowing toxic green"/></div>
      </section>
      <section className="marquee" aria-label="SENTINEL integrations"><div>/// PASHOV SKILLS &nbsp;•&nbsp; SYBIL MEMORY &nbsp;•&nbsp; BASE PROOF &nbsp;•&nbsp; VIRTUALS ACP &nbsp;•&nbsp; NVIDIA INFERENCE &nbsp;•&nbsp; PASHOV SKILLS &nbsp;•&nbsp; SYBIL MEMORY ///</div></section>
      <section id="protocol" className="protocol-section"><div className="section-index"><span>01 / PROTOCOL</span><p>NO TERMINAL REQUIRED</p></div><div className="protocol-heading"><h2>FROM REPOSITORY<br/>TO <span>RESOLUTION.</span></h2><p>A security workflow built for bounty hunters who need evidence, memory, and relentless follow-up.</p></div><div className="protocol-grid">{steps.map(([n,title,copy])=><article key={n}><span>{n}</span><Crosshair/><h3>{title}</h3><p>{copy}</p><ArrowDownRight/></article>)}</div></section>
      <section id="memory" className="memory-command"><div className="memory-copy"><span className="terminal-kicker">[ SYBIL / PERSISTENT CONTEXT ]</span><h2>THE AUDIT ENDS.<br/><i>THE MEMORY DOESN’T.</i></h2><p>Each bug stays attached to the contract, commit, evidence, attack conditions, and expected repair. The next scan begins with everything already learned.</p><ul><li><Check/>Pashov and manual findings share one memory</li><li><Check/>Changed code is checked against the original attack path</li><li><Check/>You make the final FIXED or OPEN decision</li></ul></div>
        <div className="terminal-window"><header><span>root@sentinel:~/vault-protocol</span><i/><i/><i/></header><div className="terminal-body"><p><b>$</b> sybil recall --contract Vault.sol</p><p className="dim">loading persistent memory............. done</p><br/><p><span>HIGH</span> reentrancy::withdraw()</p><p className="indent">status&nbsp;&nbsp;&nbsp;&nbsp; OPEN</p><p className="indent">commit&nbsp;&nbsp;&nbsp;&nbsp; 41bc9e</p><p className="indent">evidence&nbsp;&nbsp; external call precedes state update</p><br/><p><b>$</b> sentinel watch --daily <i className="cursor">█</i></p></div><footer><BrainCircuit/> SYBIL CONTEXT LOCKED <strong>01 MEMORY</strong></footer></div></section>
      <section id="network" className="network-grid"><article className="network-lead"><span>02 / NETWORK</span><h2>BUILT TO OPERATE<br/>IN THE OPEN.</h2><p>Agents, proofs, and payments work together without publishing private vulnerability details.</p></article><article className="acid-card"><ShieldCheck/><small>BASE</small><h3>PROOF WITHOUT THE LEAK.</h3><p>Anchor status changes onchain while sensitive evidence remains private.</p><div className="ascii-chain">[0x01]━━[0x02]━━[0x03]</div></article><article className="black-card"><Terminal/><small>VIRTUALS ACP</small><h3>AN AGENT THAT CAN GET PAID.</h3><p>SYBIL accepts security work, executes the audit, returns evidence, and settles on Base.</p><a href="https://app.virtuals.io" target="_blank" rel="noreferrer">VIEW NETWORK <ArrowRight/></a></article></section>
      <section className="powered-section" aria-labelledby="powered-title">
        <div className="powered-heading"><span className="terminal-kicker">[ POWERED BY ]</span><h2 id="powered-title">THREE PARTS.<br/><span>ONE SENTINEL.</span></h2><p>Memory, agent coordination, and proof — each has a different job in keeping track of your contract’s security.</p></div>
        <div className="powered-grid">
          <article><img src="/partners/sibyl.png" alt="Sibyl logo" width="80" height="80" loading="lazy"/><span className="powered-role">THE MEMORY</span><h3>Sibyl</h3><p>Remembers the bugs found in each contract, including your own findings. Future checks use that history to see whether the original problem is still there.</p><p className="powered-why">So every review builds on what was already learned.</p></article>
          <article><img src="/partners/virtuals.png" alt="Virtuals logo" width="80" height="80" loading="lazy"/><span className="powered-role">THE AGENT NETWORK</span><h3>Virtuals</h3><p>Connects the SYBIL agent to audit and recheck jobs. The agent uses Pashov’s security skills to review the selected contracts and return its findings.</p><p className="powered-why">So a review can run as a job with a clear result.</p></article>
          <article><img src="/partners/base.png" alt="Base logo" width="80" height="80" loading="lazy"/><span className="powered-role">THE PROOF</span><h3>Base</h3><p>Provides the blockchain for audit receipts and agent payments. A receipt can be verified without putting private vulnerability details onchain.</p><p className="powered-why">So completed work can have a verifiable record.</p></article>
        </div>
      </section>
      <footer className="cyber-footer"><span>SENTINEL // 2026</span><p>PASHOV × SYBIL × BASE × VIRTUALS</p><span>STATUS: <i/> OPERATIONAL</span></footer>
    </main></div>;
}
