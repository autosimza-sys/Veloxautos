// Findings contain rule names and line numbers only, never matched values.
export function scanSecretText(text) {
  if (typeof text !== 'string') return [];
  const findings=[];
  const rules=[
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['credential',/\b(?:sb_secret_[A-Za-z0-9_-]{20,}|sk-(?:ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/g],
  ];
  for(const [rule,pattern] of rules)for(const match of text.matchAll(pattern))findings.push({rule,line:text.slice(0,match.index).split('\n').length});
  for(const match of text.matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/g)){
    try{
      const payload=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString('utf8'));
      if(payload.role==='service_role')findings.push({rule:'privileged-jwt',line:text.slice(0,match.index).split('\n').length});
    }catch{ /* Not a parseable JWT; do not print or send its contents. */ }
  }
  return findings;
}
