"use client";
import { FormEvent, useState, useEffect } from "react";
import { auth, onAuthStateChanged, signOut, type User } from "../lib/firebase";
type Result = { extraction: {patient_id?:string; diagnosis?:string; treatment_cycle?:number; symptoms:string[]; labs:{name:string;value:number;unit?:string}[]}; review_flags:{severity:string;message:string;rationale:string}[]; draft_note:string; disclaimer:string };
const DEMO = "Patient 104 is a 58-year-old male with colorectal cancer. He is currently on cycle 3 chemotherapy. He has developed fever since yesterday. WBC is 2100 and ANC is 900. He reports increased fatigue.";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export default function Dashboard() { 
  const [transcript,setTranscript]=useState(DEMO); 
  const [result,setResult]=useState<Result|null>(null); 
  const [error,setError]=useState(""); 
  const [loading,setLoading]=useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        window.location.href = '/login';
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, []);

  async function start(e:FormEvent){e.preventDefault();setLoading(true);setError("");try{const r=await fetch(`${API}/api/v1/rounds/extract`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript})});if(!r.ok)throw new Error("The API could not process this round.");setResult(await r.json())}catch(e){setError(e instanceof Error?e.message:"Unexpected error.")}finally{setLoading(false)}}
  
  if (!user) return <p>Loading...</p>;

  return <main><header><div><p className="eyebrow">DEMO / CLINICIAN-IN-THE-LOOP</p><h1>RoundsAI</h1></div><div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}><span className="badge">Patient #104</span><button className="secondary" onClick={() => signOut(auth)} style={{padding: '0.25rem 0.5rem', fontSize: '0.8rem'}}>Sign Out</button></div></header><section className="input-card"><h2>Start a round</h2><p>Enter fictional clinical text. RoundsAI extracts documented facts only.</p><form onSubmit={start}><textarea value={transcript} onChange={e=>setTranscript(e.target.value)} aria-label="Clinical round text"/><button disabled={loading}>{loading?"PROCESSING…":"START ROUND"}</button></form>{error&&<p className="error">{error}</p>}</section>{result&&<section className="results"><div className="card"><p className="eyebrow">PATIENT SUMMARY</p><h2>{result.extraction.patient_id??"Demo patient"}</h2><dl><dt>Diagnosis</dt><dd>{result.extraction.diagnosis??"Not stated"}</dd><dt>Treatment</dt><dd>{result.extraction.treatment_cycle?`Cycle ${result.extraction.treatment_cycle}`:"Not stated"}</dd><dt>Symptoms</dt><dd>{result.extraction.symptoms.join(", ")||"None extracted"}</dd><dt>Labs</dt><dd>{result.extraction.labs.map(x=>`${x.name} ${x.value} ${x.unit??""}`).join(" · ")||"None extracted"}</dd></dl></div><div className="card"><p className="eyebrow">REVIEW FLAGS</p>{result.review_flags.length?result.review_flags.map(x=><div className="flag" key={x.message}><strong>⚠ {x.message}</strong><p>{x.rationale}</p></div>):<p>No rule-based flags from this text.</p>}</div><div className="card full"><p className="eyebrow">AI DRAFT — EDIT BEFORE APPROVAL</p><textarea className="note" defaultValue={result.draft_note} aria-label="Editable clinical draft note"/><div className="actions"><button type="button" className="secondary">EDIT</button><button type="button" className="secondary" onClick={()=>alert("Demo only — approval is intentionally not persisted.")}>APPROVE</button></div></div><p className="disclaimer">{result.disclaimer}</p></section>}</main> }
