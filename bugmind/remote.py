"""Dashboard-backed CLI: server reviews, shared account workspaces."""
import json
import re
import time
import urllib.parse
import urllib.request
import urllib.error
from bugmind.cloud import call, dashboard_url
from bugmind.settings import read_config, write_config, delete_secret
from worker.core import ReviewError

DEFAULT_DASHBOARD = 'https://bugmind-cli.zedef0808.chatgpt.site'

def add_commands(commands):
    commands.add_parser('logout', help='Revoke this terminal session')
    ws = commands.add_parser('workspace', help='Manage dashboard workspaces').add_subparsers(dest='action', required=True)
    ws.add_parser('list')
    use = ws.add_parser('use'); use.add_argument('id')
    create = ws.add_parser('create'); create.add_argument('repository'); create.add_argument('--contracts', nargs='+'); create.add_argument('--branch')
    audit = commands.add_parser('audit', help='Queue a server audit or inspect its progress'); audit.add_argument('--workspace'); audit.add_argument('--wait', action='store_true'); audit.add_argument('--timeout', type=int, default=600)
    findings = commands.add_parser('findings', help='Read or add shared findings'); findings.add_argument('--workspace')
    fs = findings.add_subparsers(dest='action')
    show=fs.add_parser('show'); show.add_argument('id')
    add=fs.add_parser('add'); add.add_argument('--title'); add.add_argument('--contract'); add.add_argument('--severity', choices=['critical','high','medium','low']); add.add_argument('--description')
    change=fs.add_parser('set-status'); change.add_argument('id'); change.add_argument('status', choices=['open','confirmed','dismissed','fixed'])
    watch=commands.add_parser('watch', help='Check monitoring availability'); watch.add_argument('action', choices=['status','enable'])

def clean(value):
    return ''.join(c for c in str(value) if c.isprintable())

def github_json(url):
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'SENTINEL/0.3','Accept':'application/vnd.github+json'})
        with urllib.request.urlopen(request,timeout=30) as response:
            return json.load(response)
    except (urllib.error.URLError,ValueError):
        raise ReviewError('GitHub could not read this public repository. Check the URL or try again after the rate limit resets.') from None

def discover(repository, branch=None):
    match=re.fullmatch(r'https://github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?',repository.strip(),re.I)
    if not match: raise ReviewError('Use a public GitHub repository URL: https://github.com/owner/repository')
    owner,name=match.groups(); base=f'https://api.github.com/repos/{owner}/{name}'
    info=github_json(base); branch=branch or info['default_branch']
    tree=github_json(base+'/git/trees/'+urllib.parse.quote(branch,safe='')+'?recursive=1')
    if tree.get('truncated'): raise ReviewError('GitHub returned an incomplete file tree. Choose a smaller repository.')
    paths=sorted(item['path'] for item in tree.get('tree',[]) if item.get('type')=='blob' and item.get('path','').lower().endswith('.sol'))
    if not paths: raise ReviewError('No Solidity contracts were found.')
    return f'https://github.com/{owner}/{name}',branch,paths

def select_contracts(paths, selected=None):
    if selected is None:
        for i,path in enumerate(paths,1): print(f'  {i}. {clean(path)}')
        answer=input('Select up to 8 numbers, separated by commas (q to cancel): ').strip()
        if answer.lower()=='q': raise KeyboardInterrupt
        try:
            indices=[int(x.strip()) for x in answer.split(',')]
            if any(i<1 or i>len(paths) for i in indices): raise ValueError()
            selected=[paths[i-1] for i in indices]
        except (ValueError,IndexError): raise ReviewError('Choose valid contract numbers.') from None
    selected=list(dict.fromkeys(selected))
    if not 1<=len(selected)<=8 or any(p not in paths for p in selected): raise ReviewError('Choose 1 to 8 contracts from this repository.')
    return selected

def current(args):
    value=getattr(args,'workspace',None) or read_config().get('workspace_id')
    if not value: raise ReviewError('Run sentinel workspace create URL or sentinel workspace use ID first.')
    # IDs are path components, never user-controlled URL fragments.
    return urllib.parse.quote(value,safe='')

def activate(value):
    config=read_config();config['workspace_id']=value;write_config(config)

def execute_remote(args):
    if args.command=='watch':
        if args.action=='enable': raise ReviewError('Scheduled rechecks and email delivery are not enabled on this server yet. No monitoring was scheduled.')
        print('Scheduled rechecks and email delivery: not available yet.');return
    if args.command=='logout':
        call('/api/cli/revoke',{},method='DELETE')
        config=read_config();base=dashboard_url(config.get('dashboard',''))
        delete_secret('dashboard-'+base);config.pop('workspace_id',None);write_config(config)
        print('This CLI session has been revoked.');return
    if args.command=='workspace':
        if args.action=='list':
            rows=call('/api/workspaces')['workspaces']
            for row in rows: print(clean(row['id']),clean(row['status']),clean(row['repository']))
            if not rows: print('No workspaces yet. Run sentinel workspace create REPOSITORY_URL.')
        elif args.action=='use':
            row=call('/api/workspaces/'+urllib.parse.quote(args.id,safe=''));activate(row['id']);print('Selected:',clean(row['repository']))
        else:
            # Verify login before querying GitHub or prompting for a scope.
            call('/api/workspaces')
            repository,branch,paths=discover(args.repository,args.branch)
            selected=select_contracts(paths,args.contracts)
            row=call('/api/workspaces',{'repository':repository,'branch':branch,'contracts':selected,'draft':True})
            activate(row['id']);print('Workspace:',row['id']);print('Run sentinel audit to start the server review.')
        return
    wid=current(args);prefix='/api/workspaces/'+wid
    if args.command=='audit':
        if not 1<=args.timeout<=3600: raise ReviewError('--timeout must be between 1 and 3600 seconds.')
        row=call(prefix)
        if row['status']=='draft':row=call(prefix+'/audit',{})
        print('Audit:',clean(row['status']))
        print('Dashboard:',dashboard_url(read_config()['dashboard'])+'/dashboard/workspaces/'+wid)
        deadline=time.monotonic()+args.timeout
        while args.wait and row['status'] in {'queued','running'}:
            if time.monotonic()>=deadline:
                print('Still processing on the server. You can close the terminal and check later.');return
            time.sleep(5);row=call(prefix);print('Audit:',clean(row['status']))
        if row['status']=='failed':raise ReviewError('The audit needs attention. Open the workspace for details.')
        if row['status']=='watching':print('Audit complete. Run sentinel findings. Scheduled rechecks are not yet enabled.')
        return
    if args.action=='add':
        ws=call(prefix)
        title=args.title or input('Finding title: ').strip()
        contract=args.contract or select_contracts(ws['contracts'])[0]
        severity=args.severity or input('Severity (critical/high/medium/low): ').strip().lower()
        description=args.description or input('Evidence and description: ').strip()
        if not title or not description or severity not in {'critical','high','medium','low'} or contract not in ws['contracts']:raise ReviewError('Provide a title, evidence, valid severity, and workspace contract.')
        row=call(prefix+'/findings',dict(title=title,contract=contract,severity=severity,description=description))
        print('Manual finding saved to your workspace:',row['id']);return
    if args.action=='set-status':
        call(prefix+'/findings/'+urllib.parse.quote(args.id,safe=''),{'status':args.status},method='PATCH');print('Finding marked',args.status);return
    rows=call(prefix+'/findings')['findings']
    if args.action=='show':
        row=next((x for x in rows if x['id']==args.id),None)
        if not row:raise ReviewError('Finding not found in the selected workspace.')
        for key in ['id','title','severity','status','source','contract','description']:print(key+':',clean(row[key]))
    else:
        for row in rows:print(clean(row['id']),clean(row['severity']),clean(row['status']),clean(row['title']))
        if not rows:print('No findings yet. Check sentinel audit for progress.')
