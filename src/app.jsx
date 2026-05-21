import { useState, useEffect, useCallback } from "react";

var CURRENCIES = ["AUD","BGN","BRL","CAD","CHF","CNY","CZK","DKK","EUR","GBP","HKD","HUF","IDR","ILS","INR","ISK","JPY","KRW","MXN","MYR","NOK","NZD","PHP","PLN","RON","SEK","SGD","THB","TRY","USD","ZAR"];
var DEFAULT_CATEGORIES = ["Income","Housing","Food","Transport","Healthcare","Entertainment","Education","Investments","Savings","Utilities","Insurance","Other"];
var FREQ = ["Daily","Weekly","Fortnightly","Monthly","Quarterly","Annually"];
var FALLBACK_RATES = {NZD:1,USD:1.63,AUD:1.07,EUR:1.76,GBP:2.09,JPY:0.011,SGD:1.22,CNY:0.23,CAD:1.20,CHF:1.85,PHP:0.027,HKD:0.21,KRW:0.0012,INR:0.019,THB:0.048,MYR:0.37,IDR:0.0001,BRL:0.29,MXN:0.084,ZAR:0.089,SEK:0.16,NOK:0.15,DKK:0.24,PLN:0.41,CZK:0.071,HUF:0.0044,RON:0.35,BGN:0.90,ISK:0.012,ILS:0.45};
var INIT = {accounts:[],transactions:[],budgets:[],bills:[],investments:[],investmentTxns:[],baseCurrency:"NZD",categories:DEFAULT_CATEGORIES,users:[{id:"u1",name:"Admin",role:"admin"}],currentUser:"u1"};

function fmt(n,cur) { var c=cur||"NZD"; try{return new Intl.NumberFormat("en-NZ",{style:"currency",currency:c,minimumFractionDigits:2}).format(n||0);}catch(e){return c+" "+(n||0).toFixed(2);} }
function fmtNum(n) { return new Intl.NumberFormat("en-NZ",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0); }
function today() { return new Date().toISOString().slice(0,10); }
function uid() { return Math.random().toString(36).slice(2,9); }
function toBase(amount,currency,baseCurrency,rates) { if(currency===baseCurrency) return amount; var r=rates||{}; return (amount*(r[currency]||1))/(r[baseCurrency]||1); }
function saveState(s) { try{localStorage.setItem("fintrack_v1",JSON.stringify(s));}catch(e){} }
function saveUsers(users) { try{localStorage.setItem("fintrack_users",JSON.stringify(users));}catch(e){} }
function loadUsers() { try{var r=localStorage.getItem("fintrack_users"); var u=r?JSON.parse(r):null; return(Array.isArray(u)&&u.length>0)?u:[{id:"u1",name:"Admin",role:"admin"}];}catch(e){return [{id:"u1",name:"Admin",role:"admin"}];} }
function loadState() {
  try {
    var r=localStorage.getItem("fintrack_v1");
    if(!r) return INIT;
    var s=JSON.parse(r);
    return {
      accounts:       Array.isArray(s.accounts)?s.accounts:[],
      transactions:   Array.isArray(s.transactions)?s.transactions:[],
      budgets:        Array.isArray(s.budgets)?s.budgets:[],
      bills:          Array.isArray(s.bills)?s.bills:[],
      investments:    Array.isArray(s.investments)?s.investments:[],
      investmentTxns: Array.isArray(s.investmentTxns)?s.investmentTxns:[],
      baseCurrency:   s.baseCurrency||"NZD",
      categories:     (Array.isArray(s.categories)&&s.categories.length>0)?s.categories:DEFAULT_CATEGORIES.slice(),
      users:          (Array.isArray(s.users)&&s.users.length>0)?s.users:[{id:"u1",name:"Admin",role:"admin"}],
      currentUser:    s.currentUser||"u1",
      _filterAccountId: ""
    };
  } catch(e) { return INIT; }
}
function calcIRR(cashflows) {
  if(!cashflows||cashflows.length<2) return null;
  var baseMs=new Date(cashflows[0].date).getTime(), flows=[], i, cf;
  for(i=0;i<cashflows.length;i++){cf=cashflows[i];flows.push({t:(new Date(cf.date).getTime()-baseMs)/(365.25*24*3600*1000),v:cf.amount});}
  var hasPos=false,hasNeg=false;
  for(i=0;i<flows.length;i++){if(flows[i].v>0)hasPos=true;if(flows[i].v<0)hasNeg=true;}
  if(!hasPos||!hasNeg) return null;
  var rate=0.1,nn,dn,nx,iter;
  for(iter=0;iter<100;iter++){
    nn=0;dn=0;
    for(i=0;i<flows.length;i++){nn+=flows[i].v/Math.pow(1+rate,flows[i].t);dn-=flows[i].t*flows[i].v/Math.pow(1+rate,flows[i].t+1);}
    if(Math.abs(dn)<1e-12) break;
    nx=rate-nn/dn; if(nx<-0.999)nx=-0.999;
    if(Math.abs(nx-rate)<1e-8){rate=nx;break;} rate=nx;
  }
  if(!isFinite(rate)||rate<-1) return null;
  return rate;
}

function StatCard(props) {
  return (
    <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"0.875rem 1rem"}}>
      <div style={{fontSize:"11px",color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"4px"}}>{props.label}</div>
      <div style={{fontSize:"20px",fontWeight:500,color:props.color||"var(--color-text-primary)"}}>{props.value}</div>
      {props.sub?<div style={{fontSize:"11px",color:"var(--color-text-secondary)",marginTop:"2px"}}>{props.sub}</div>:null}
    </div>
  );
}
function SectionHeader(props) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
      <h2 style={{margin:0,fontSize:"16px",fontWeight:500}}>{props.title}</h2>
      {props.action||null}
    </div>
  );
}
function Btn(props) {
  var v=props.variant||"default";
  var bg={default:"#f5f5f5",primary:"#111",ghost:"transparent"};
  var bd={default:"2px solid #d0d0d0",primary:"2px solid #111",ghost:"2px solid transparent"};
  var cl={default:"#111",primary:"#fff",ghost:"#666"};
  return (
    <button onClick={props.disabled?undefined:props.onClick}
      style={{background:bg[v],border:bd[v],color:cl[v],borderRadius:"999px",padding:props.small?"4px 12px":"7px 16px",fontSize:props.small?"12px":"13px",fontWeight:500,cursor:props.disabled?"not-allowed":"pointer",display:"inline-flex",alignItems:"center",gap:"5px",fontFamily:"var(--font-sans)",opacity:props.disabled?0.4:1,whiteSpace:"nowrap"}}>
      {props.children}
    </button>
  );
}
function Field(props) {
  return (
    <div style={{marginBottom:"0.75rem"}}>
      <label style={{display:"block",fontSize:"12px",color:"var(--color-text-secondary)",marginBottom:"4px"}}>{props.label}</label>
      {props.children}
    </div>
  );
}
function Input(props) {
  var base={width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:"13px",fontFamily:"var(--font-sans)"};
  var merged=props.style?Object.assign({},base,props.style):base;
  var rest={};for(var k in props){if(k!=="style")rest[k]=props[k];}
  return <input style={merged} {...rest} />;
}
function Sel(props) {
  var base={width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:"13px",fontFamily:"var(--font-sans)"};
  var merged=props.style?Object.assign({},base,props.style):base;
  var ch=props.children; var rest={};for(var k in props){if(k!=="style"&&k!=="children")rest[k]=props[k];}
  return <select style={merged} {...rest}>{ch}</select>;
}
function Empty(props) { return <div style={{padding:"2rem 0",textAlign:"center",color:"var(--color-text-secondary)",fontSize:"13px"}}>{props.text}</div>; }
function Modal(props) {
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"#00000066"}} onClick={props.onClose}></div>
      <div style={{position:"relative",zIndex:1001,background:"#fff",borderRadius:"8px",border:"2px solid #e0e0e0",boxShadow:"0 8px 32px rgba(0,0,0,0.22)",padding:"1.5rem",width:"400px",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",paddingBottom:"0.75rem",borderBottom:"1px solid #e0e0e0"}}>
          <h3 style={{margin:0,fontSize:"16px",fontWeight:600,color:"#111"}}>{props.title}</h3>
          <button onClick={props.onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:"18px",color:"#666",lineHeight:1}}>&#10005;</button>
        </div>
        <div style={{color:"#111"}}>{props.children}</div>
      </div>
    </div>
  );
}

function UserAdder(props) {
  var [name,setName]=useState("");
  var [role,setRole]=useState("viewer");
  var [users,setUsers]=useState(loadUsers);
  function add() {
    var n=name.trim(); if(!n) return;
    var fresh=loadUsers();
    var newUsers=fresh.concat([{id:uid(),name:n,role:role}]);
    saveUsers(newUsers); setUsers(newUsers); setName("");
  }
  function del(id) {
    if(users.length<=1) return;
    var fresh=loadUsers();
    var newUsers=fresh.filter(function(u){return u.id!==id;});
    saveUsers(newUsers); setUsers(newUsers);
  }
  return (
    <div>
      {users.map(function(u){
        return (
          <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:"13px"}}>
            <span>{u.name}</span>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <span style={{color:"var(--color-text-secondary)",fontSize:"11px"}}>{u.role}</span>
              {users.length>1?<Btn small={true} variant="ghost" onClick={function(){del(u.id);}}><i className="ti ti-trash" style={{fontSize:"12px"}}></i></Btn>:null}
            </div>
          </div>
        );
      })}
      <div style={{display:"flex",gap:"8px",marginTop:"0.75rem",alignItems:"center"}}>
        <Input value={name} onChange={function(e){setName(e.target.value);}} placeholder="New user name" onKeyDown={function(e){if(e.key==="Enter")add();}} style={{flex:1,padding:"6px 10px",fontSize:"13px"}} />
        <select value={role} onChange={function(e){setRole(e.target.value);}} style={{padding:"6px 10px",borderRadius:"999px",border:"2px solid #d0d0d0",fontSize:"13px",background:"#f5f5f5"}}>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
        <Btn onClick={add} disabled={!name.trim()}><i className="ti ti-user-plus"></i>Add</Btn>
      </div>
    </div>
  );
}

export default function App() {
  var [state,setState]=useState(loadState);
  var [page,setPage]=useState("dashboard");
  var [modal,setModal]=useState(null);
  var [rates,setRates]=useState(FALLBACK_RATES);
  var [ratesStatus,setRatesStatus]=useState("loading");

  useEffect(function(){
    fetch("https://api.frankfurter.app/latest?from=NZD")
      .then(function(r){return r.json();})
      .then(function(data){
        if(data.rates){var r={NZD:1};var keys=Object.keys(data.rates);for(var i=0;i<keys.length;i++)r[keys[i]]=1/data.rates[keys[i]];setRates(r);setRatesStatus("live");}
      }).catch(function(){setRates(FALLBACK_RATES);setRatesStatus("fallback");});
  },[]);

  var update=useCallback(function(patch){
    setState(function(prev){var next=Object.assign({},prev,patch);saveState(next);return next;});
  },[]);

  var invs=state.investments||[];
  var invTxns=state.investmentTxns||[];
  var base=state.baseCurrency||"NZD";
  var categories=(state.categories&&state.categories.length>0)?state.categories:DEFAULT_CATEGORIES;

  var accountsWithBalance=(state.accounts||[]).map(function(acc){
    var txns=(state.transactions||[]).filter(function(t){return t.accountId===acc.id;});
    var txnBal=txns.reduce(function(s,t){return t.type==="income"?s+Number(t.amount):s-Number(t.amount);},Number(acc.openingBalance||0));
    if(acc.type==="investment"){
      var mktVal=invs.filter(function(i){return i.accountId===acc.id;}).reduce(function(s,i){return s+i.units*i.currentPrice;},0);
      return Object.assign({},acc,{balance:txnBal+mktVal,cashBalance:txnBal,marketValue:mktVal});
    }
    return Object.assign({},acc,{balance:txnBal});
  });

  var netWorth=accountsWithBalance.filter(function(a){return !a.hidden;}).reduce(function(s,a){
    var v=toBase(a.balance,a.currency,base,rates);
    return a.type==="credit"?s-v:s+v;
  },0);

  var thisMonth=new Date().toISOString().slice(0,7);
  var monthTxns=(state.transactions||[]).filter(function(t){return t.date.startsWith(thisMonth);});
  var monthIncome=monthTxns.filter(function(t){return t.type==="income"&&t.category!=="Transfer";}).reduce(function(s,t){return s+toBase(Number(t.amount),t.currency,base,rates);},0);
  var monthExpenses=monthTxns.filter(function(t){return t.type==="expense"&&t.category!=="Transfer";}).reduce(function(s,t){return s+toBase(Number(t.amount),t.currency,base,rates);},0);

  var pages=[
    {id:"dashboard",icon:"ti-home",label:"Dashboard"},
    {id:"accounts",icon:"ti-building-bank",label:"Accounts"},
    {id:"transactions",icon:"ti-list",label:"Transactions"},
    {id:"transfers",icon:"ti-transfer",label:"Transfers"},
    {id:"budgets",icon:"ti-chart-pie",label:"Budgets"},
    {id:"bills",icon:"ti-calendar-repeat",label:"Bills"},
    {id:"investments",icon:"ti-trending-up",label:"Investments"},
    {id:"reports",icon:"ti-report-analytics",label:"Reports"},
    {id:"settings",icon:"ti-settings",label:"Settings"}
  ];

  var shared={state:state,update:update,modal:modal,setModal:setModal,fmt:fmt,fmtNum:fmtNum,today:today,uid:uid,CURRENCIES:CURRENCIES,CATEGORIES:categories,rates:rates,toBase:toBase,base:base,invs:invs,invTxns:invTxns,accountsWithBalance:accountsWithBalance};
  var curUser=(state.users||[]).find(function(u){return u.id===state.currentUser;});

  return (
    <div style={{display:"flex",height:"100vh",width:"100vw",fontFamily:"var(--font-sans)",fontSize:"14px",background:"var(--color-background-primary)",overflow:"hidden",position:"relative"}}>
      <div style={{width:"200px",flexShrink:0,background:"var(--color-background-secondary)",borderRight:"0.5px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",padding:"1rem 0"}}>
        <div style={{padding:"0 1rem 1rem",borderBottom:"0.5px solid var(--color-border-tertiary)",marginBottom:"0.5rem"}}>
          <div style={{fontWeight:600,fontSize:"16px"}}>FinTrack</div>
          <div style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{base} base</div>
        </div>
        {pages.map(function(p){
          return (
            <button key={p.id} onClick={function(){setPage(p.id);}}
              style={{display:"flex",alignItems:"center",gap:"8px",padding:"9px 1rem",background:page===p.id?"var(--color-background-primary)":"transparent",border:"none",borderLeft:page===p.id?"3px solid var(--color-text-primary)":"3px solid transparent",cursor:"pointer",width:"100%",textAlign:"left",color:page===p.id?"var(--color-text-primary)":"var(--color-text-secondary)",fontSize:"13px",fontWeight:page===p.id?500:400}}>
              <i className={"ti "+p.icon} style={{fontSize:"16px"}}></i>{p.label}
            </button>
          );
        })}
        <div style={{marginTop:"auto",padding:"0.75rem 1rem",borderTop:"0.5px solid var(--color-border-tertiary)"}}>
          <div style={{fontSize:"11px",color:"var(--color-text-secondary)",marginBottom:"4px"}}>
            <i className="ti ti-user" style={{fontSize:"13px",marginRight:"4px"}}></i>{curUser?curUser.name:"Admin"}
          </div>
          <div style={{fontSize:"10px",display:"flex",alignItems:"center",gap:"4px",color:ratesStatus==="live"?"var(--color-text-success)":ratesStatus==="fallback"?"var(--color-text-warning)":"var(--color-text-secondary)"}}>
            <i className={"ti "+(ratesStatus==="live"?"ti-circle-check":ratesStatus==="fallback"?"ti-alert-triangle":"ti-loader")} style={{fontSize:"11px"}}></i>
            {ratesStatus==="live"?"Live rates":ratesStatus==="fallback"?"Fallback rates":"Fetching..."}
          </div>
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:"1.5rem"}}>
        {page==="dashboard"    && <Dashboard    shared={shared} netWorth={netWorth} monthIncome={monthIncome} monthExpenses={monthExpenses} setPage={setPage} />}
        {page==="accounts"     && <Accounts     shared={shared} setPage={setPage} />}
        {page==="transactions" && <Transactions shared={shared} filterAccountId={state._filterAccountId||""} />}
        {page==="transfers"    && <Transfers    shared={shared} />}
        {page==="budgets"      && <Budgets      shared={shared} monthTxns={monthTxns} />}
        {page==="bills"        && <Bills        shared={shared} />}
        {page==="investments"  && <Investments  shared={shared} />}
        {page==="reports"      && <Reports      shared={shared} netWorth={netWorth} monthIncome={monthIncome} monthExpenses={monthExpenses} />}
        {page==="settings"     && <Settings     shared={shared} />}
      </div>
    </div>
  );
}

function Dashboard(props) {
  var sh=props.shared,state=sh.state,fmt=sh.fmt,base=sh.base,accountsWithBalance=sh.accountsWithBalance;
  var netWorth=props.netWorth,monthIncome=props.monthIncome,monthExpenses=props.monthExpenses,setPage=props.setPage;
  var visible=accountsWithBalance.filter(function(a){return !a.hidden;});
  var recent=(state.transactions||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);}).slice(0,5);
  var upcoming=(state.bills||[]).filter(function(b){return b.nextDue>=today();}).sort(function(a,b){return a.nextDue.localeCompare(b.nextDue);}).slice(0,3);
  return (
    <div>
      <h2 style={{margin:"0 0 1rem",fontSize:"16px",fontWeight:500}}>Overview</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"1.25rem"}}>
        <StatCard label="Net worth" value={fmt(netWorth,base)} />
        <StatCard label="Month income" value={fmt(monthIncome,base)} color="var(--color-text-success)" />
        <StatCard label="Month expenses" value={fmt(monthExpenses,base)} color="var(--color-text-danger)" />
        <StatCard label="Accounts" value={visible.length} sub={(state.transactions||[]).length+" transactions"} />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        <div>
          <SectionHeader title="Accounts" action={<Btn small={true} onClick={function(){setPage("accounts");}}>View all</Btn>} />
          {visible.length===0?<Empty text="No accounts yet" />:null}
          {visible.slice(0,5).map(function(a){
            return (
              <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                <div><div style={{fontSize:"13px",fontWeight:500}}>{a.name}</div><div style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{a.type} · {a.currency}</div></div>
                <div style={{fontSize:"13px",fontWeight:500,color:a.balance<0?"var(--color-text-danger)":"var(--color-text-primary)"}}>{fmt(a.balance,a.currency)}</div>
              </div>
            );
          })}
        </div>
        <div>
          <SectionHeader title="Recent transactions" action={<Btn small={true} onClick={function(){setPage("transactions");}}>View all</Btn>} />
          {recent.length===0?<Empty text="No transactions yet" />:null}
          {recent.map(function(t){
            var acc=(state.accounts||[]).find(function(a){return a.id===t.accountId;});
            return (
              <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                <div><div style={{fontSize:"13px"}}>{t.description||t.category}</div><div style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{t.date} · {acc?acc.name:""}</div></div>
                <div style={{fontSize:"13px",fontWeight:500,color:t.type==="income"?"var(--color-text-success)":"var(--color-text-danger)"}}>{t.type==="income"?"+":"-"}{fmt(t.amount,t.currency)}</div>
              </div>
            );
          })}
          {upcoming.length>0?(
            <div>
              <div style={{marginTop:"1rem",marginBottom:"0.5rem",fontSize:"13px",fontWeight:500}}>Upcoming bills</div>
              {upcoming.map(function(b){
                return (
                  <div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                    <span style={{fontSize:"13px"}}>{b.name}</span>
                    <span style={{fontSize:"13px",color:"var(--color-text-secondary)"}}>{b.nextDue} · {fmt(b.amount,b.currency)}</span>
                  </div>
                );
              })}
            </div>
          ):null}
        </div>
      </div>
    </div>
  );
}

function Accounts(props) {
  var sh=props.shared,state=sh.state,update=sh.update,fmt=sh.fmt,modal=sh.modal,setModal=sh.setModal,uid=sh.uid,CURRENCIES=sh.CURRENCIES,accountsWithBalance=sh.accountsWithBalance;
  var setPage=props.setPage;
  var blank={name:"",type:"checking",currency:"NZD",openingBalance:"",openingDate:today()};
  var [form,setForm]=useState(blank);
  var [editId,setEditId]=useState(null);
  var types=["checking","savings","credit","cash","investment","loan"];
  var visible=accountsWithBalance.filter(function(a){return !a.hidden;});
  var hidden=accountsWithBalance.filter(function(a){return a.hidden;});

  function goToTransactions(accountId) { update({_filterAccountId:accountId}); setPage("transactions"); }
  function save() {
    if(!form.name) return;
    var acc=Object.assign({},form,{openingBalance:Number(form.openingBalance)||0});
    if(editId) update({accounts:(state.accounts||[]).map(function(a){return a.id===editId?Object.assign({},a,acc):a;})});
    else update({accounts:(state.accounts||[]).concat([Object.assign({},acc,{id:uid()})])});
    setModal(null);setForm(blank);setEditId(null);
  }
  function startEdit(a) { setForm({name:a.name,type:a.type,currency:a.currency,openingBalance:String(a.openingBalance||""),openingDate:a.openingDate||today()}); setEditId(a.id); setModal("addAcc"); }
  function del(id) { update({accounts:(state.accounts||[]).filter(function(a){return a.id!==id;}),transactions:(state.transactions||[]).filter(function(t){return t.accountId!==id;})}); }
  function toggleHide(id) { update({accounts:(state.accounts||[]).map(function(a){return a.id===id?Object.assign({},a,{hidden:!a.hidden}):a;})}); }
  function closeModal() { setModal(null);setForm(blank);setEditId(null); }

  return (
    <div>
      <SectionHeader title="Accounts" action={<Btn onClick={function(){setForm(blank);setEditId(null);setModal("addAcc");}}><i className="ti ti-plus"></i>Add account</Btn>} />
      {visible.length===0?<Empty text="No accounts yet" />:null}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
        {visible.map(function(a){
          var hasTxns=(state.transactions||[]).some(function(t){return t.accountId===a.id;});
          var txnCount=(state.transactions||[]).filter(function(t){return t.accountId===a.id;}).length;
          return (
            <div key={a.id} style={{background:"var(--color-background-primary)",border:"2px solid #d0d0d0",borderRadius:"12px",padding:"1rem",cursor:"pointer"}}
              onClick={function(e){if(e.target.closest("button"))return;goToTransactions(a.id);}}
              onMouseEnter={function(e){e.currentTarget.style.borderColor="#888";e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.10)";}}
              onMouseLeave={function(e){e.currentTarget.style.borderColor="#d0d0d0";e.currentTarget.style.boxShadow="none";}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"8px"}}>
                <div>
                  <div style={{fontWeight:500,fontSize:"14px"}}>{a.name}</div>
                  <div style={{fontSize:"11px",color:"var(--color-text-secondary)",textTransform:"capitalize"}}>{a.type} · {a.currency} · {txnCount} txn{txnCount!==1?"s":""}</div>
                </div>
                <div style={{display:"flex",gap:"4px",flexShrink:0}} onClick={function(e){e.stopPropagation();}}>
                  <Btn small={true} onClick={function(){startEdit(a);}}><i className="ti ti-edit" style={{fontSize:"12px"}}></i>Edit</Btn>
                  <Btn small={true} onClick={function(){toggleHide(a.id);}}><i className="ti ti-eye-off" style={{fontSize:"12px"}}></i>Hide</Btn>
                  {hasTxns?null:<Btn small={true} onClick={function(){del(a.id);}}><i className="ti ti-trash" style={{fontSize:"12px"}}></i>Del</Btn>}
                </div>
              </div>
              <div style={{marginTop:"0.75rem",fontSize:"22px",fontWeight:500,color:a.balance<0?"var(--color-text-danger)":"var(--color-text-primary)"}}>{fmt(a.balance,a.currency)}</div>
              {a.type==="investment"?(
                <div style={{fontSize:"11px",color:"var(--color-text-secondary)",marginTop:"4px",display:"flex",gap:"12px"}}>
                  <span>Cash: {fmt(a.cashBalance,a.currency)}</span>
                  <span>Holdings: {fmt(a.marketValue,a.currency)}</span>
                </div>
              ):null}
              <div style={{fontSize:"11px",color:"var(--color-text-secondary)",marginTop:"2px",display:"flex",justifyContent:"space-between"}}>
                <span>Opening: {fmt(a.openingBalance,a.currency)} · {a.openingDate}</span>
                <span>Click to view →</span>
              </div>
            </div>
          );
        })}
      </div>
      {hidden.length>0?(
        <div style={{marginTop:"2rem"}}>
          <div style={{fontWeight:500,fontSize:"13px",marginBottom:"0.75rem",color:"var(--color-text-secondary)"}}>Hidden accounts</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            {hidden.map(function(a){
              return (
                <div key={a.id} style={{background:"var(--color-background-secondary)",border:"2px solid #d0d0d0",borderRadius:"12px",padding:"1rem",opacity:0.65}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div><div style={{fontWeight:500,fontSize:"14px"}}>{a.name}</div><div style={{fontSize:"11px",color:"var(--color-text-secondary)",textTransform:"capitalize"}}>{a.type} · {a.currency}</div></div>
                    <Btn small={true} onClick={function(){toggleHide(a.id);}}><i className="ti ti-eye" style={{fontSize:"12px"}}></i>Unhide</Btn>
                  </div>
                  <div style={{marginTop:"0.75rem",fontSize:"20px",fontWeight:500,color:"var(--color-text-secondary)"}}>{fmt(a.balance,a.currency)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ):null}
      {modal==="addAcc"?(
        <Modal title={editId?"Edit account":"Add account"} onClose={closeModal}>
          <Field label="Name"><Input value={form.name} onChange={function(e){setForm(Object.assign({},form,{name:e.target.value}));}} placeholder="e.g. ANZ Everyday" /></Field>
          <Field label="Type"><Sel value={form.type} onChange={function(e){setForm(Object.assign({},form,{type:e.target.value}));}}>{types.map(function(t){return <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>;})}</Sel></Field>
          <Field label="Currency"><Sel value={form.currency} onChange={function(e){setForm(Object.assign({},form,{currency:e.target.value}));}}>{CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</Sel></Field>
          <Field label="Opening balance"><Input type="number" value={form.openingBalance} onChange={function(e){setForm(Object.assign({},form,{openingBalance:e.target.value}));}} placeholder="0.00" /></Field>
          <Field label="Opening date"><Input type="date" value={form.openingDate} onChange={function(e){setForm(Object.assign({},form,{openingDate:e.target.value}));}} /></Field>
          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={save}>{editId?"Save changes":"Add account"}</Btn>
          </div>
        </Modal>
      ):null}
    </div>
  );
}

function Transactions(props) {
  var sh=props.shared,state=sh.state,update=sh.update,fmt=sh.fmt,modal=sh.modal,setModal=sh.setModal,uid=sh.uid,CURRENCIES=sh.CURRENCIES,CATEGORIES=sh.CATEGORIES;
  var filterAccountId=props.filterAccountId||"";
  var blank={accountId:filterAccountId,type:"expense",amount:"",currency:"NZD",date:today(),category:"Other",description:""};
  var [form,setForm]=useState(blank);
  var [filter,setFilter]=useState({acc:filterAccountId,type:""});
  var [editId,setEditId]=useState(null);
  var [autoOpened,setAutoOpened]=useState(false);

  useEffect(function(){
    if(filterAccountId&&!autoOpened){
      setFilter({acc:filterAccountId,type:""});
      setAutoOpened(true);
      update({_filterAccountId:""});
    }
  },[filterAccountId]);

  useEffect(function(){
    if(form.accountId){var a=(state.accounts||[]).find(function(a){return a.id===form.accountId;});if(a)setForm(function(f){return Object.assign({},f,{currency:a.currency});});}
  },[form.accountId]);

  var filtered=(state.transactions||[]).filter(function(t){return(!filter.acc||t.accountId===filter.acc)&&(!filter.type||t.type===filter.type);}).sort(function(a,b){return a.date.localeCompare(b.date);});

  var singleAcc = filter.acc ? (state.accounts||[]).find(function(a){return a.id===filter.acc;}) : null;
  var openingBal = singleAcc ? Number(singleAcc.openingBalance||0) : 0;
  var runningBalances = [];
  if(singleAcc) {
    var bal = openingBal;
    for(var ri=0; ri<filtered.length; ri++) {
      var rt = filtered[ri];
      bal = rt.type==="income" ? bal+Number(rt.amount) : bal-Number(rt.amount);
      runningBalances.push(bal);
    }
  }
  var displayFiltered = filtered;
  var displayBalances = runningBalances;

  function save() {
    if(!form.accountId||!form.amount) return;
    var t=Object.assign({},form,{amount:Number(form.amount),id:editId||uid()});
    if(editId) update({transactions:(state.transactions||[]).map(function(x){return x.id===editId?t:x;})});
    else update({transactions:(state.transactions||[]).concat([t])});
    setModal(null);setForm(blank);setEditId(null);
  }
  function del(id) { update({transactions:(state.transactions||[]).filter(function(t){return t.id!==id;})}); }
  function edit(t) { setForm(Object.assign({},t,{amount:String(t.amount)}));setEditId(t.id);setModal("addTxn"); }
  function closeModal() { setModal(null);setEditId(null);setForm(blank); }

  return (
    <div>
      <SectionHeader title="Transactions" action={
        <div style={{display:"flex",gap:"8px"}}>
          <Sel value={filter.acc} onChange={function(e){setFilter(Object.assign({},filter,{acc:e.target.value}));}} style={{width:"auto",fontSize:"12px",padding:"4px 8px"}}>
            <option value="">All accounts</option>
            {(state.accounts||[]).map(function(a){return <option key={a.id} value={a.id}>{a.name}</option>;})}
          </Sel>
          <Sel value={filter.type} onChange={function(e){setFilter(Object.assign({},filter,{type:e.target.value}));}} style={{width:"auto",fontSize:"12px",padding:"4px 8px"}}>
            <option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option>
          </Sel>
          <Btn onClick={function(){setForm(blank);setEditId(null);setModal("addTxn");}}><i className="ti ti-plus"></i>Add</Btn>
        </div>
      } />
      {singleAcc ? (
        <div style={{fontSize:"12px",color:"var(--color-text-secondary)",marginBottom:"0.75rem",padding:"8px 12px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:singleAcc.type==="investment"?"6px":"0px"}}>
            <span>Account: <strong style={{color:"var(--color-text-primary)"}}>{singleAcc.name}</strong></span>
            <span>Opening balance: <strong style={{color:"var(--color-text-primary)"}}>{fmt(openingBal,singleAcc.currency)}</strong></span>
          </div>
          {singleAcc.type==="investment"?(function(){
            var accHoldings=(sh.invs||[]).filter(function(i){return i.accountId===singleAcc.id;});
            var mktVal=accHoldings.reduce(function(s,i){return s+i.units*i.currentPrice;},0);
            var cashBal=runningBalances.length>0?runningBalances[runningBalances.length-1]:openingBal;
            var totalVal=cashBal+mktVal;
            return (
              <div style={{display:"flex",gap:"16px",paddingTop:"6px",borderTop:"0.5px solid var(--color-border-tertiary)"}}>
                <span>Cash: <strong style={{color:cashBal<0?"var(--color-text-danger)":"var(--color-text-primary)"}}>{fmt(cashBal,singleAcc.currency)}</strong></span>
                <span>Holdings value: <strong style={{color:"var(--color-text-primary)"}}>{fmt(mktVal,singleAcc.currency)}</strong></span>
                <span>Total: <strong style={{color:"var(--color-text-primary)"}}>{fmt(totalVal,singleAcc.currency)}</strong></span>
              </div>
            );
          })():null}
        </div>
      ):null}
      {displayFiltered.length===0?<Empty text="No transactions" />:null}
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
        <thead><tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          {(singleAcc?["Date","Description","Category","Debit","Credit","Balance",""]:["Date","Description","Category","Account","Amount",""]).map(function(h){return <th key={h} style={{textAlign:"left",padding:"6px 8px",fontWeight:500,fontSize:"11px",color:"var(--color-text-secondary)"}}>{h}</th>;})}
        </tr></thead>
        <tbody>
          {displayFiltered.map(function(t,idx){
            var acc=(state.accounts||[]).find(function(a){return a.id===t.accountId;});
            var runBal=singleAcc?displayBalances[idx]:null;
            if(singleAcc) {
              return (
                <tr key={t.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                  <td style={{padding:"8px"}}>{t.date}</td>
                  <td style={{padding:"8px"}}>{t.description||"—"}</td>
                  <td style={{padding:"8px"}}><span style={{fontSize:"11px",padding:"2px 7px",borderRadius:"99px",background:"var(--color-background-secondary)"}}>{t.category}</span></td>
                  <td style={{padding:"8px",color:"var(--color-text-danger)"}}>{t.type==="expense"?fmt(t.amount,t.currency):"—"}</td>
                  <td style={{padding:"8px",color:"var(--color-text-success)"}}>{t.type==="income"?fmt(t.amount,t.currency):"—"}</td>
                  <td style={{padding:"8px",fontWeight:500,color:runBal<0?"var(--color-text-danger)":"var(--color-text-primary)"}}>{fmt(runBal,singleAcc.currency)}</td>
                  <td style={{padding:"8px"}}>
                    <div style={{display:"flex",gap:"6px"}}>
                      <Btn small={true} onClick={function(){edit(t);}}><i className="ti ti-edit" style={{fontSize:"12px"}}></i>Edit</Btn>
                      <Btn small={true} onClick={function(){del(t.id);}}><i className="ti ti-trash" style={{fontSize:"12px"}}></i>Del</Btn>
                    </div>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={t.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                <td style={{padding:"8px"}}>{t.date}</td>
                <td style={{padding:"8px"}}>{t.description||"—"}</td>
                <td style={{padding:"8px"}}><span style={{fontSize:"11px",padding:"2px 7px",borderRadius:"99px",background:"var(--color-background-secondary)"}}>{t.category}</span></td>
                <td style={{padding:"8px",color:"var(--color-text-secondary)"}}>{acc?acc.name:""}</td>
                <td style={{padding:"8px",fontWeight:500,color:t.type==="income"?"var(--color-text-success)":"var(--color-text-danger)"}}>{t.type==="income"?"+":"-"}{fmt(t.amount,t.currency)}</td>
                <td style={{padding:"8px"}}>
                  <div style={{display:"flex",gap:"6px"}}>
                    <Btn small={true} onClick={function(){edit(t);}}><i className="ti ti-edit" style={{fontSize:"12px"}}></i>Edit</Btn>
                    <Btn small={true} onClick={function(){del(t.id);}}><i className="ti ti-trash" style={{fontSize:"12px"}}></i>Del</Btn>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {modal==="addTxn"?(
        <Modal title={editId?"Edit transaction":"Add transaction"} onClose={closeModal}>
          <Field label="Account"><Sel value={form.accountId} onChange={function(e){setForm(Object.assign({},form,{accountId:e.target.value}));}}><option value="">Select account</option>{(state.accounts||[]).map(function(a){return <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>;})}</Sel></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <Field label="Type"><Sel value={form.type} onChange={function(e){setForm(Object.assign({},form,{type:e.target.value}));}}><option value="expense">Expense</option><option value="income">Income</option></Sel></Field>
            <Field label="Category"><Sel value={form.category} onChange={function(e){setForm(Object.assign({},form,{category:e.target.value}));}}>{(CATEGORIES||DEFAULT_CATEGORIES).map(function(c){return <option key={c}>{c}</option>;})}</Sel></Field>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"8px"}}>
            <Field label="Amount"><Input type="number" value={form.amount} onChange={function(e){setForm(Object.assign({},form,{amount:e.target.value}));}} placeholder="0.00" /></Field>
            <Field label="Currency"><Sel value={form.currency} onChange={function(e){setForm(Object.assign({},form,{currency:e.target.value}));}}>{CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</Sel></Field>
          </div>
          <Field label="Date"><Input type="date" value={form.date} onChange={function(e){setForm(Object.assign({},form,{date:e.target.value}));}} /></Field>
          <Field label="Description"><Input value={form.description} onChange={function(e){setForm(Object.assign({},form,{description:e.target.value}));}} placeholder="Optional note" /></Field>
          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={save}>{editId?"Save changes":"Add transaction"}</Btn>
          </div>
        </Modal>
      ):null}
    </div>
  );
}

function Transfers(props) {
  var sh=props.shared,state=sh.state,update=sh.update,fmt=sh.fmt,modal=sh.modal,setModal=sh.setModal,uid=sh.uid,accountsWithBalance=sh.accountsWithBalance;
  var blank={fromId:"",toId:"",fromAmount:"",toAmount:"",date:today(),note:""};
  var [form,setForm]=useState(blank);
  var fromAcc=accountsWithBalance.find(function(a){return a.id===form.fromId;});
  var toAcc=accountsWithBalance.find(function(a){return a.id===form.toId;});
  var crossCurrency=fromAcc&&toAcc&&fromAcc.currency!==toAcc.currency;

  function save() {
    if(!form.fromId||!form.toId||!form.fromAmount||form.fromId===form.toId) return;
    if(crossCurrency&&!form.toAmount) return;
    var tid=uid();
    var toAmt=crossCurrency?Number(form.toAmount):Number(form.fromAmount);
    var toCur=toAcc?toAcc.currency:(fromAcc?fromAcc.currency:"NZD");
    var fromCur=fromAcc?fromAcc.currency:"NZD";
    update({transactions:(state.transactions||[]).concat([
      {id:tid+"_out",accountId:form.fromId,type:"expense",amount:Number(form.fromAmount),currency:fromCur,date:form.date,category:"Transfer",description:"Transfer to "+(toAcc?toAcc.name:"")+(form.note?" — "+form.note:""),transferId:tid},
      {id:tid+"_in",accountId:form.toId,type:"income",amount:toAmt,currency:toCur,date:form.date,category:"Transfer",description:"Transfer from "+(fromAcc?fromAcc.name:"")+(form.note?" — "+form.note:""),transferId:tid}
    ])});
    setModal(null);setForm(blank);
  }
  var tids=[];
  (state.transactions||[]).forEach(function(t){if(t.transferId&&tids.indexOf(t.transferId)===-1)tids.push(t.transferId);});
  var transfers=tids.map(function(tid){
    var out=(state.transactions||[]).find(function(t){return t.transferId===tid&&t.type==="expense";});
    var inn=(state.transactions||[]).find(function(t){return t.transferId===tid&&t.type==="income";});
    return(out&&inn)?{tid:tid,out:out,inn:inn}:null;
  }).filter(Boolean).sort(function(a,b){return b.out.date.localeCompare(a.out.date);});
  function delTransfer(tid) { update({transactions:(state.transactions||[]).filter(function(t){return t.transferId!==tid;})}); }

  return (
    <div>
      <SectionHeader title="Transfers" action={<Btn onClick={function(){setModal("addTransfer");}}><i className="ti ti-plus"></i>New transfer</Btn>} />
      {transfers.length===0?<Empty text="No transfers yet" />:null}
      {transfers.map(function(item){
        var fa=(state.accounts||[]).find(function(a){return a.id===item.out.accountId;});
        var ta=(state.accounts||[]).find(function(a){return a.id===item.inn.accountId;});
        return (
          <div key={item.tid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
            <div>
              <div style={{fontSize:"13px",fontWeight:500}}>{fa?fa.name:""} → {ta?ta.name:""}</div>
              <div style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{item.out.date}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"13px",fontWeight:500,color:"var(--color-text-danger)"}}>-{fmt(item.out.amount,item.out.currency)}</div>
                <div style={{fontSize:"13px",fontWeight:500,color:"var(--color-text-success)"}}>+{fmt(item.inn.amount,item.inn.currency)}</div>
              </div>
              <Btn small={true} variant="ghost" onClick={function(){delTransfer(item.tid);}}><i className="ti ti-trash" style={{fontSize:"13px"}}></i></Btn>
            </div>
          </div>
        );
      })}
      {modal==="addTransfer"?(
        <Modal title="New transfer" onClose={function(){setModal(null);setForm(blank);}}>
          <Field label="From account">
            <Sel value={form.fromId} onChange={function(e){setForm(Object.assign({},form,{fromId:e.target.value,toId:form.toId===e.target.value?"":form.toId}));}}>
              <option value="">Select account</option>
              {accountsWithBalance.map(function(a){return <option key={a.id} value={a.id}>{a.name} ({a.currency}) — {fmt(a.balance,a.currency)}</option>;})}
            </Sel>
          </Field>
          <Field label="To account">
            <Sel value={form.toId} onChange={function(e){setForm(Object.assign({},form,{toId:e.target.value}));}}>
              <option value="">Select account</option>
              {accountsWithBalance.filter(function(a){return a.id!==form.fromId;}).map(function(a){return <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>;})}
            </Sel>
          </Field>
          <Field label={"Amount sent"+(fromAcc?" ("+fromAcc.currency+")":"")}>
            <Input type="number" value={form.fromAmount} onChange={function(e){setForm(Object.assign({},form,{fromAmount:e.target.value}));}} placeholder="0.00" />
          </Field>
          {crossCurrency?(
            <div>
              <Field label={"Amount received ("+toAcc.currency+") — enter exact bank amount"}>
                <Input type="number" value={form.toAmount} onChange={function(e){setForm(Object.assign({},form,{toAmount:e.target.value}));}} placeholder="0.00" />
              </Field>
              {form.fromAmount&&form.toAmount?(
                <div style={{fontSize:"12px",color:"var(--color-text-secondary)",padding:"8px 10px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",marginBottom:"0.75rem"}}>
                  {"Effective rate: 1 "+fromAcc.currency+" = "+(Number(form.toAmount)/Number(form.fromAmount)).toFixed(4)+" "+toAcc.currency}
                </div>
              ):null}
            </div>
          ):null}
          <Field label="Date"><Input type="date" value={form.date} onChange={function(e){setForm(Object.assign({},form,{date:e.target.value}));}} /></Field>
          <Field label="Note (optional)"><Input value={form.note} onChange={function(e){setForm(Object.assign({},form,{note:e.target.value}));}} placeholder="e.g. Monthly savings" /></Field>
          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={function(){setModal(null);setForm(blank);}}>Cancel</Btn>
            <Btn variant="primary" onClick={save} disabled={!form.fromId||!form.toId||!form.fromAmount||(crossCurrency&&!form.toAmount)}>Transfer</Btn>
          </div>
        </Modal>
      ):null}
    </div>
  );
}

function Budgets(props) {
  var sh=props.shared,state=sh.state,update=sh.update,fmt=sh.fmt,modal=sh.modal,setModal=sh.setModal,uid=sh.uid,CATEGORIES=sh.CATEGORIES,rates=sh.rates,base=sh.base;
  var monthTxns=props.monthTxns||[];
  var [form,setForm]=useState({category:"Food",amount:""});
  function save() {
    if(!form.amount) return;
    var ex=(state.budgets||[]).find(function(b){return b.category===form.category;});
    var b=Object.assign({},form,{amount:Number(form.amount),id:ex?ex.id:uid()});
    if(ex) update({budgets:(state.budgets||[]).map(function(x){return x.id===ex.id?b:x;})});
    else update({budgets:(state.budgets||[]).concat([b])});
    setModal(null);
  }
  function getSpent(cat) { return monthTxns.filter(function(t){return t.type==="expense"&&t.category===cat;}).reduce(function(s,t){return s+toBase(Number(t.amount),t.currency,base,rates);},0); }
  return (
    <div>
      <SectionHeader title="Monthly budgets" action={<Btn onClick={function(){setModal("addBudget");}}><i className="ti ti-plus"></i>Set budget</Btn>} />
      {(state.budgets||[]).length===0?<Empty text="No budgets set yet" />:null}
      {(state.budgets||[]).map(function(b){
        var spent=getSpent(b.category),pct=Math.min(100,(spent/b.amount)*100),over=spent>b.amount;
        return (
          <div key={b.id} style={{marginBottom:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
              <span style={{fontSize:"13px",fontWeight:500}}>{b.category}</span>
              <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                <span style={{fontSize:"12px",color:over?"var(--color-text-danger)":"var(--color-text-secondary)"}}>{fmt(spent,base)} / {fmt(b.amount,base)}</span>
                <Btn small={true} variant="ghost" onClick={function(){update({budgets:(state.budgets||[]).filter(function(x){return x.id!==b.id;})});}}><i className="ti ti-trash" style={{fontSize:"13px"}}></i></Btn>
              </div>
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:"99px",height:"8px",overflow:"hidden"}}>
              <div style={{width:pct+"%",background:over?"var(--color-background-danger)":"var(--color-background-success)",height:"100%",borderRadius:"99px"}}></div>
            </div>
            {over?<div style={{fontSize:"11px",color:"var(--color-text-danger)",marginTop:"2px"}}>Over by {fmt(spent-b.amount,base)}</div>:null}
          </div>
        );
      })}
      {modal==="addBudget"?(
        <Modal title="Set budget" onClose={function(){setModal(null);}}>
          <Field label="Category"><Sel value={form.category} onChange={function(e){setForm(Object.assign({},form,{category:e.target.value}));}}>{(CATEGORIES||DEFAULT_CATEGORIES).filter(function(c){return c!=="Income";}).map(function(c){return <option key={c}>{c}</option>;})}</Sel></Field>
          <Field label={"Monthly limit ("+base+")"}><Input type="number" value={form.amount} onChange={function(e){setForm(Object.assign({},form,{amount:e.target.value}));}} placeholder="0.00" /></Field>
          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={function(){setModal(null);}}>Cancel</Btn>
            <Btn variant="primary" onClick={save}>Save</Btn>
          </div>
        </Modal>
      ):null}
    </div>
  );
}

function Bills(props) {
  var sh=props.shared,state=sh.state,update=sh.update,fmt=sh.fmt,modal=sh.modal,setModal=sh.setModal,uid=sh.uid,CURRENCIES=sh.CURRENCIES,CATEGORIES=sh.CATEGORIES;
  var blank={name:"",amount:"",currency:"NZD",frequency:"Monthly",category:"Utilities",nextDue:today()};
  var [form,setForm]=useState(blank);
  function save() {
    if(!form.name||!form.amount) return;
    update({bills:(state.bills||[]).concat([Object.assign({},form,{amount:Number(form.amount),id:uid()})])});
    setModal(null);setForm(blank);
  }
  var sorted=(state.bills||[]).slice().sort(function(a,b){return a.nextDue.localeCompare(b.nextDue);});
  return (
    <div>
      <SectionHeader title="Bills & recurring" action={<Btn onClick={function(){setModal("addBill");}}><i className="ti ti-plus"></i>Add bill</Btn>} />
      {sorted.length===0?<Empty text="No bills yet" />:null}
      {sorted.map(function(b){
        var ov=b.nextDue<today();
        return (
          <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
            <div>
              <div style={{fontSize:"13px",fontWeight:500}}>{b.name}</div>
              <div style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{b.frequency} · Due: <span style={{color:ov?"var(--color-text-danger)":"inherit"}}>{b.nextDue}</span></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <span style={{fontSize:"13px",fontWeight:500}}>{fmt(b.amount,b.currency)}</span>
              <Btn small={true} variant="ghost" onClick={function(){update({bills:(state.bills||[]).filter(function(x){return x.id!==b.id;})});}}><i className="ti ti-trash" style={{fontSize:"13px"}}></i></Btn>
            </div>
          </div>
        );
      })}
      {modal==="addBill"?(
        <Modal title="Add bill" onClose={function(){setModal(null);}}>
          <Field label="Name"><Input value={form.name} onChange={function(e){setForm(Object.assign({},form,{name:e.target.value}));}} placeholder="e.g. Netflix" /></Field>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"8px"}}>
            <Field label="Amount"><Input type="number" value={form.amount} onChange={function(e){setForm(Object.assign({},form,{amount:e.target.value}));}} placeholder="0.00" /></Field>
            <Field label="Currency"><Sel value={form.currency} onChange={function(e){setForm(Object.assign({},form,{currency:e.target.value}));}}>{CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</Sel></Field>
          </div>
          <Field label="Frequency"><Sel value={form.frequency} onChange={function(e){setForm(Object.assign({},form,{frequency:e.target.value}));}}>{FREQ.map(function(f){return <option key={f}>{f}</option>;})}</Sel></Field>
          <Field label="Category"><Sel value={form.category} onChange={function(e){setForm(Object.assign({},form,{category:e.target.value}));}}>{(CATEGORIES||DEFAULT_CATEGORIES).filter(function(c){return c!=="Income";}).map(function(c){return <option key={c}>{c}</option>;})}</Sel></Field>
          <Field label="Next due"><Input type="date" value={form.nextDue} onChange={function(e){setForm(Object.assign({},form,{nextDue:e.target.value}));}} /></Field>
          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={function(){setModal(null);}}>Cancel</Btn>
            <Btn variant="primary" onClick={save}>Add bill</Btn>
          </div>
        </Modal>
      ):null}
    </div>
  );
}

function Investments(props) {
  var sh=props.shared,state=sh.state,update=sh.update,fmt=sh.fmt,fmtNum=sh.fmtNum,uid=sh.uid,CURRENCIES=sh.CURRENCIES,invs=sh.invs,invTxns=sh.invTxns;
  var invAccounts=(state.accounts||[]).filter(function(a){return a.type==="investment";});
  var cashAccounts=(state.accounts||[]).filter(function(a){return a.type!=="investment";});
  var hBlank={accountId:"",name:"",ticker:"",units:"",rawCostPerUnit:"",currency:"NZD",currentPrice:"",purchaseDate:today(),type:"equity",brokerageFee:""};
  var tBlank={holdingId:"",action:"buy",units:"",price:"",brokerageFee:"",dividendAmount:"",dividendAccountId:"",date:today(),note:""};
  var [hForm,setHForm]=useState(hBlank);
  var [hEditId,setHEditId]=useState(null);
  var [showHForm,setShowHForm]=useState(false);
  var [tForm,setTForm]=useState(tBlank);
  var [showTForm,setShowTForm]=useState(false);
  var [tErr,setTErr]=useState("");
  var [refreshing,setRefreshing]=useState(false);
  var [refreshMsg,setRefreshMsg]=useState("");

  useEffect(function(){
    if(hForm.accountId){var a=(state.accounts||[]).find(function(a){return a.id===hForm.accountId;});if(a)setHForm(function(f){return Object.assign({},f,{currency:a.currency});});}
  },[hForm.accountId]);

  function saveHolding() {
    if(!hForm.accountId||!hForm.name||!hForm.units||!hForm.rawCostPerUnit) return;
    var fee=Number(hForm.brokerageFee)||0,units=Number(hForm.units),raw=Number(hForm.rawCostPerUnit);
    var adj=raw+(fee/units);
    var inv=Object.assign({},hForm,{units:units,costPerUnit:adj,rawCostPerUnit:raw,brokerageFee:fee,currentPrice:Number(hForm.currentPrice||raw),id:hEditId||uid()});
    var newInvs=hEditId?invs.map(function(i){return i.id===hEditId?inv:i;}):invs.concat([inv]);
    var newTxns=(state.transactions||[]).slice();
    if(!hEditId){
      var totalCost=units*raw+fee;
      newTxns.push({id:uid(),accountId:hForm.accountId,type:"expense",amount:totalCost,currency:hForm.currency,date:hForm.purchaseDate,category:"Investments",description:"Buy "+units+" x "+hForm.name+(fee>0?" (incl. "+fmt(fee,hForm.currency)+" brokerage)":"")});
    }
    update({investments:newInvs,transactions:newTxns});
    setShowHForm(false);setHForm(hBlank);setHEditId(null);
  }
  function delHolding(id) { update({investments:invs.filter(function(i){return i.id!==id;}),investmentTxns:invTxns.filter(function(t){return t.holdingId!==id;})}); }
  function startEdit(i) { setHForm(Object.assign({},i,{units:String(i.units),rawCostPerUnit:String(i.rawCostPerUnit!=null?i.rawCostPerUnit:i.costPerUnit),currentPrice:String(i.currentPrice),brokerageFee:String(i.brokerageFee||"")}));setHEditId(i.id);setShowHForm(true); }
  function startTrade(i) { setTForm(Object.assign({},tBlank,{holdingId:i.id,price:String(i.currentPrice)}));setTErr("");setShowTForm(true); }

  function executeTrade() {
    setTErr("");
    var h=invs.find(function(i){return i.id===tForm.holdingId;});
    if(!h){setTErr("Holding not found");return;}
    var newITxns=invTxns.concat([Object.assign({},tForm,{id:uid()})]);
    if(tForm.action==="dividend"){
      var amt=Number(tForm.dividendAmount);
      if(!amt||amt<=0){setTErr("Enter a dividend amount");return;}
      if(!tForm.dividendAccountId){setTErr("Select a deposit account");return;}
      var dest=(state.accounts||[]).find(function(a){return a.id===tForm.dividendAccountId;})||
               (state.accounts||[]).find(function(a){return a.id===h.accountId;});
      if(!dest){setTErr("Account not found");return;}
      update({investmentTxns:newITxns,transactions:(state.transactions||[]).concat([{id:uid(),accountId:dest.id,type:"income",amount:amt,currency:dest.currency,date:tForm.date,category:"Investments",description:"Dividend: "+h.name+(tForm.note?" — "+tForm.note:"")}])});
      setShowTForm(false);setTForm(tBlank);return;
    }
    var units=Number(tForm.units),price=Number(tForm.price),fee=Number(tForm.brokerageFee)||0;
    if(!units||units<=0){setTErr("Enter units");return;}
    if(!price||price<=0){setTErr("Enter price");return;}
    if(tForm.action==="buy"){
      var tot=h.units+units,avgCost=(h.units*h.costPerUnit+units*price+fee)/tot;
      var nt=(state.transactions||[]).slice();
      var totalBuyCost=units*price+fee;
      nt.push({id:uid(),accountId:h.accountId,type:"expense",amount:totalBuyCost,currency:h.currency,date:tForm.date,category:"Investments",description:"Buy "+units+" x "+h.name+(fee>0?" (incl. "+fmt(fee,h.currency)+" brokerage)":"")});
      update({investments:invs.map(function(i){return i.id===h.id?Object.assign({},h,{units:tot,costPerUnit:avgCost,currentPrice:price}):i;}),investmentTxns:newITxns,transactions:nt});
    } else {
      if(units>h.units){setTErr("You only hold "+fmtNum(h.units)+" units");return;}
      var gain=(price*units)-(h.costPerUnit*units)-fee;
      var nt2=(state.transactions||[]).slice();
      var netProceeds=units*price-fee;
      nt2.push({id:uid(),accountId:h.accountId,type:"income",amount:Math.max(0,netProceeds),currency:h.currency,date:tForm.date,category:"Investments",description:"Sell "+units+" x "+h.name+(fee>0?" (after "+fmt(fee,h.currency)+" brokerage)":"")});
      if(gain!==0) nt2.push({id:uid(),accountId:h.accountId,type:gain>=0?"income":"expense",amount:Math.abs(gain),currency:h.currency,date:tForm.date,category:"Investments",description:(gain>=0?"Capital gain":"Capital loss")+": "+units+" x "+h.name+(tForm.note?" — "+tForm.note:""),isCapitalGainLoss:true});
      update({investments:invs.map(function(i){return i.id===h.id?Object.assign({},h,{units:Math.max(0,h.units-units),currentPrice:price}):i;}),investmentTxns:newITxns,transactions:nt2});
    }
    setShowTForm(false);setTForm(tBlank);
  }

  function refreshPrices() {
    var tickers=[];
    invs.forEach(function(i){if(i.ticker&&tickers.indexOf(i.ticker.toUpperCase())===-1)tickers.push(i.ticker.toUpperCase());});
    if(!tickers.length){setRefreshMsg("No tickers");setTimeout(function(){setRefreshMsg("");},3000);return;}
    setRefreshing(true);setRefreshMsg("Fetching...");
    fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:"Current stock prices for: "+tickers.join(", ")+". Reply ONLY with JSON like {\"AAPL\":213.45}. No markdown."}]})})
    .then(function(r){return r.json();})
    .then(function(data){
      var text=(data.content||[]).filter(function(b){return b.type==="text";}).map(function(b){return b.text;}).join("");
      var match=text.match(/\{[\s\S]*\}/);if(!match)throw new Error("no JSON");
      var results=JSON.parse(match[0]);
      update({investments:invs.map(function(i){var p=i.ticker?results[i.ticker.toUpperCase()]:null;return p?Object.assign({},i,{currentPrice:Number(p)}):i;})});
      setRefreshMsg("Updated "+Object.keys(results).length+" price(s)");
    }).catch(function(){setRefreshMsg("Failed");})
    .then(function(){setRefreshing(false);setTimeout(function(){setRefreshMsg("");},4000);});
  }

  function getHoldingFlows(h) {
    var flows=[{date:h.purchaseDate||today(),amount:-((h.rawCostPerUnit||h.costPerUnit)*h.units+(h.brokerageFee||0))}];
    invTxns.filter(function(t){return t.holdingId===h.id;}).forEach(function(t){
      if(t.action==="buy") flows.push({date:t.date,amount:-(t.units*t.price+(Number(t.brokerageFee)||0))});
      else if(t.action==="sell") flows.push({date:t.date,amount:t.units*t.price-(Number(t.brokerageFee)||0)});
      else if(t.action==="dividend") flows.push({date:t.date,amount:Number(t.dividendAmount||0)});
    });
    if(h.units>0) flows.push({date:today(),amount:h.units*h.currentPrice});
    return flows.sort(function(a,b){return a.date.localeCompare(b.date);});
  }
  function getPortfolioFlows() {
    var flows=[];
    invs.forEach(function(h){
      flows.push({date:h.purchaseDate||today(),amount:-((h.rawCostPerUnit||h.costPerUnit)*h.units+(h.brokerageFee||0))});
      invTxns.filter(function(t){return t.holdingId===h.id;}).forEach(function(t){
        if(t.action==="buy") flows.push({date:t.date,amount:-(t.units*t.price+(Number(t.brokerageFee)||0))});
        else if(t.action==="sell") flows.push({date:t.date,amount:t.units*t.price-(Number(t.brokerageFee)||0)});
        else if(t.action==="dividend") flows.push({date:t.date,amount:Number(t.dividendAmount||0)});
      });
      if(h.units>0) flows.push({date:today(),amount:h.units*h.currentPrice});
    });
    return flows.sort(function(a,b){return a.date.localeCompare(b.date);});
  }
  function fmtIRR(r){return r===null?"N/A":(r*100).toFixed(1)+"%";}

  var totalValue=invs.reduce(function(s,i){return s+i.units*i.currentPrice;},0);
  var totalCost=invs.reduce(function(s,i){return s+i.units*i.costPerUnit;},0);
  var totalGain=totalValue-totalCost;
  var portfolioIRR=calcIRR(getPortfolioFlows());
  var activeHolding=invs.find(function(i){return i.id===tForm.holdingId;});
  var invTypes=["equity","etf","crypto","bond","property","other"];

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"1.25rem"}}>
        <StatCard label="Portfolio value" value={fmt(totalValue,state.baseCurrency)} />
        <StatCard label="Total cost" value={fmt(totalCost,state.baseCurrency)} />
        <StatCard label="Gain / loss" value={fmt(totalGain,state.baseCurrency)} color={totalGain>=0?"var(--color-text-success)":"var(--color-text-danger)"} sub={totalCost>0?((totalGain/totalCost)*100).toFixed(1)+"%":""} />
        <StatCard label="Portfolio IRR" value={fmtIRR(portfolioIRR)} color={portfolioIRR===null?undefined:portfolioIRR>=0?"var(--color-text-success)":"var(--color-text-danger)"} sub="annualised" />
      </div>
      {invAccounts.length===0?<div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"0.875rem 1rem",marginBottom:"1rem",fontSize:"13px",color:"var(--color-text-secondary)"}}>Create an <strong>investment</strong>-type account first.</div>:null}
      <SectionHeader title="Holdings" action={
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          {refreshMsg?<span style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{refreshMsg}</span>:null}
          <Btn onClick={refreshPrices} disabled={refreshing||!invs.some(function(i){return !!i.ticker;})}><i className={"ti "+(refreshing?"ti-loader":"ti-refresh")} style={{fontSize:"14px"}}></i>{refreshing?"Refreshing...":"Refresh prices"}</Btn>
          <Btn onClick={function(){setHForm(hBlank);setHEditId(null);setShowHForm(true);}} disabled={!invAccounts.length}><i className="ti ti-plus"></i>Add holding</Btn>
        </div>
      } />
      {invAccounts.map(function(acc){
        var holdings=invs.filter(function(i){return i.accountId===acc.id;});
        var accTxns=(state.transactions||[]).filter(function(t){return t.accountId===acc.id;});
        var cashBal=accTxns.reduce(function(s,t){return t.type==="income"?s+Number(t.amount):s-Number(t.amount);},Number(acc.openingBalance||0));
        var accVal=holdings.reduce(function(s,i){return s+i.units*i.currentPrice;},0);
        var accGain=accVal-holdings.reduce(function(s,i){return s+i.units*i.costPerUnit;},0);
        return (
          <div key={acc.id} style={{marginBottom:"1.5rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-secondary)",marginBottom:"4px"}}>
              <span style={{fontWeight:500,fontSize:"13px"}}>{acc.name} <span style={{fontWeight:400,color:"var(--color-text-secondary)",fontSize:"11px"}}>({acc.currency})</span></span>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"13px",color:accGain>=0?"var(--color-text-success)":"var(--color-text-danger)"}}>{fmt(accVal,acc.currency)} holdings ({accGain>=0?"+":""}{fmt(accGain,acc.currency)})</div>
                <div style={{fontSize:"11px",color:cashBal<0?"var(--color-text-danger)":"var(--color-text-secondary)"}}>Cash: {fmt(cashBal,acc.currency)}{cashBal<0?" ⚠ insufficient cash":""}</div>
              </div>
            </div>
            {holdings.length===0?<div style={{fontSize:"12px",color:"var(--color-text-secondary)",padding:"8px 0"}}>No holdings</div>:null}
            {holdings.length>0?(
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
                <thead><tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                  {["Name","Units","Cost/unit","Price","Value","Gain/loss","IRR","Actions"].map(function(h){return <th key={h} style={{textAlign:"left",padding:"5px 8px",fontWeight:500,fontSize:"11px",color:"var(--color-text-secondary)",whiteSpace:"nowrap"}}>{h}</th>;})}
                </tr></thead>
                <tbody>
                  {holdings.map(function(i){
                    var val=i.units*i.currentPrice,gain=val-i.units*i.costPerUnit;
                    var irr=calcIRR(getHoldingFlows(i));
                    return (
                      <tr key={i.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                        <td style={{padding:"7px 8px"}}><div style={{fontWeight:500}}>{i.name}</div>{i.ticker?<div style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>{i.ticker}</div>:null}</td>
                        <td style={{padding:"7px 8px"}}>{fmtNum(i.units)}</td>
                        <td style={{padding:"7px 8px"}}>{fmt(i.costPerUnit,i.currency)}</td>
                        <td style={{padding:"7px 8px"}}>{fmt(i.currentPrice,i.currency)}</td>
                        <td style={{padding:"7px 8px",fontWeight:500}}>{fmt(val,i.currency)}</td>
                        <td style={{padding:"7px 8px",color:gain>=0?"var(--color-text-success)":"var(--color-text-danger)"}}>{gain>=0?"+":""}{fmt(gain,i.currency)}</td>
                        <td style={{padding:"7px 8px",color:irr===null?"var(--color-text-secondary)":irr>=0?"var(--color-text-success)":"var(--color-text-danger)"}}>{fmtIRR(irr)}</td>
                        <td style={{padding:"7px 8px",whiteSpace:"nowrap"}}>
                          <div style={{display:"flex",gap:"6px"}}>
                            <Btn small={true} onClick={function(){startTrade(i);}}><i className="ti ti-transfer" style={{fontSize:"13px"}}></i>Trade</Btn>
                            <Btn small={true} onClick={function(){startEdit(i);}}><i className="ti ti-edit" style={{fontSize:"13px"}}></i>Edit</Btn>
                            <Btn small={true} onClick={function(){delHolding(i.id);}}><i className="ti ti-trash" style={{fontSize:"13px"}}></i>Delete</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ):null}
          </div>
        );
      })}
      {showHForm?(
        <Modal title={hEditId?"Edit holding":"Add holding"} onClose={function(){setShowHForm(false);setHForm(hBlank);setHEditId(null);}}>
          <Field label="Investment account"><Sel value={hForm.accountId} onChange={function(e){setHForm(Object.assign({},hForm,{accountId:e.target.value}));}}><option value="">Select account</option>{invAccounts.map(function(a){return <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>;})}</Sel></Field>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"8px"}}>
            <Field label="Name"><Input value={hForm.name} onChange={function(e){setHForm(Object.assign({},hForm,{name:e.target.value}));}} placeholder="e.g. Apple Inc." /></Field>
            <Field label="Ticker"><Input value={hForm.ticker} onChange={function(e){setHForm(Object.assign({},hForm,{ticker:e.target.value}));}} placeholder="AAPL" /></Field>
          </div>
          <Field label="Type"><Sel value={hForm.type} onChange={function(e){setHForm(Object.assign({},hForm,{type:e.target.value}));}}>{invTypes.map(function(t){return <option key={t}>{t}</option>;})}</Sel></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
            <Field label="Units"><Input type="number" value={hForm.units} onChange={function(e){setHForm(Object.assign({},hForm,{units:e.target.value}));}} placeholder="0" /></Field>
            <Field label="Cost/unit (excl. fee)"><Input type="number" value={hForm.rawCostPerUnit} onChange={function(e){setHForm(Object.assign({},hForm,{rawCostPerUnit:e.target.value}));}} placeholder="0.00" /></Field>
            <Field label="Current price"><Input type="number" value={hForm.currentPrice} onChange={function(e){setHForm(Object.assign({},hForm,{currentPrice:e.target.value}));}} placeholder="0.00" /></Field>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <Field label="Currency"><Sel value={hForm.currency} onChange={function(e){setHForm(Object.assign({},hForm,{currency:e.target.value}));}}>{CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</Sel></Field>
            <Field label="Purchase date"><Input type="date" value={hForm.purchaseDate} onChange={function(e){setHForm(Object.assign({},hForm,{purchaseDate:e.target.value}));}} /></Field>
          </div>
          <Field label="Brokerage fee (optional)">
            <Input type="number" value={hForm.brokerageFee} onChange={function(e){setHForm(Object.assign({},hForm,{brokerageFee:e.target.value}));}} placeholder="0.00" />
            <div style={{fontSize:"11px",color:"var(--color-text-secondary)",marginTop:"3px"}}>Added to cost basis</div>
          </Field>
          {hForm.units&&hForm.rawCostPerUnit?<div style={{fontSize:"12px",color:"var(--color-text-secondary)",padding:"8px 10px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",marginBottom:"0.75rem"}}>Adjusted cost/unit: {fmt(Number(hForm.rawCostPerUnit)+(Number(hForm.brokerageFee)||0)/Number(hForm.units),hForm.currency)}</div>:null}
          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={function(){setShowHForm(false);setHForm(hBlank);setHEditId(null);}}>Cancel</Btn>
            <Btn variant="primary" onClick={saveHolding}>{hEditId?"Save changes":"Add holding"}</Btn>
          </div>
        </Modal>
      ):null}
      {showTForm&&activeHolding?(
        <Modal title={"Trade: "+activeHolding.name} onClose={function(){setShowTForm(false);setTForm(tBlank);setTErr("");}}>
          <div style={{display:"flex",gap:"6px",marginBottom:"1rem"}}>
            {["buy","sell","dividend"].map(function(a){
              return (
                <button key={a} onClick={function(){setTForm(function(f){return Object.assign({},f,{action:a,units:"",price:String(activeHolding.currentPrice),brokerageFee:"",dividendAmount:"",dividendAccountId:""});});}}
                  style={{flex:1,padding:"7px",borderRadius:"999px",border:"2px solid #d0d0d0",background:tForm.action===a?"#111":"#f5f5f5",color:tForm.action===a?"#fff":"#111",cursor:"pointer",fontSize:"13px",fontFamily:"var(--font-sans)",fontWeight:500}}>
                  {a.charAt(0).toUpperCase()+a.slice(1)}
                </button>
              );
            })}
          </div>
          {tForm.action==="dividend"?(
            <div>
              <Field label="Total dividend amount"><Input type="number" value={tForm.dividendAmount} onChange={function(e){setTForm(function(f){return Object.assign({},f,{dividendAmount:e.target.value});});}} placeholder="0.00" /></Field>
              <Field label="Deposit into account"><Sel value={tForm.dividendAccountId} onChange={function(e){setTForm(function(f){return Object.assign({},f,{dividendAccountId:e.target.value});});}}><option value="">Select account</option>{cashAccounts.map(function(a){return <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>;})}</Sel></Field>
            </div>
          ):(
            <div>
              <Field label={tForm.action==="buy"?"Units to buy":"Units to sell"}>
                <Input type="number" value={tForm.units} onChange={function(e){setTForm(function(f){return Object.assign({},f,{units:e.target.value});});}} placeholder="0" />
                {tForm.action==="sell"?<div style={{fontSize:"11px",color:"var(--color-text-secondary)",marginTop:"3px"}}>{"You hold "+fmtNum(activeHolding.units)+" units"}</div>:null}
              </Field>
              <Field label="Price per unit"><Input type="number" value={tForm.price} onChange={function(e){setTForm(function(f){return Object.assign({},f,{price:e.target.value});});}} placeholder={String(activeHolding.currentPrice||0)} /></Field>
              <Field label="Brokerage fee (optional)"><Input type="number" value={tForm.brokerageFee} onChange={function(e){setTForm(function(f){return Object.assign({},f,{brokerageFee:e.target.value});});}} placeholder="0.00" /></Field>
              {tForm.units&&tForm.price?(
                <div style={{fontSize:"12px",color:"var(--color-text-secondary)",marginBottom:"0.75rem",padding:"8px 10px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>
                  {"Subtotal: "+fmt(Number(tForm.units)*Number(tForm.price),activeHolding.currency)}
                  {Number(tForm.brokerageFee)>0?" + "+fmt(Number(tForm.brokerageFee),activeHolding.currency)+" fee":""}
                  {tForm.action==="sell"?" · "+((Number(tForm.price)*Number(tForm.units)-activeHolding.costPerUnit*Number(tForm.units)-(Number(tForm.brokerageFee)||0))>=0?"Gain":"Loss")+": "+fmt(Math.abs(Number(tForm.price)*Number(tForm.units)-activeHolding.costPerUnit*Number(tForm.units)-(Number(tForm.brokerageFee)||0)),activeHolding.currency):""}
                </div>
              ):null}
            </div>
          )}
          <Field label="Date"><Input type="date" value={tForm.date} onChange={function(e){setTForm(function(f){return Object.assign({},f,{date:e.target.value});});}} /></Field>
          <Field label="Note (optional)"><Input value={tForm.note} onChange={function(e){setTForm(function(f){return Object.assign({},f,{note:e.target.value});});}} placeholder="Optional note" /></Field>
          {tErr?<div style={{background:"#fee",color:"#c00",fontSize:"12px",padding:"8px 10px",borderRadius:"8px",marginTop:"0.5rem"}}>{tErr}</div>:null}
          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={function(){setShowTForm(false);setTForm(tBlank);setTErr("");}}>Cancel</Btn>
            <Btn variant="primary" onClick={executeTrade}>{tForm.action==="buy"?"Buy":tForm.action==="sell"?"Sell":"Record dividend"}</Btn>
          </div>
        </Modal>
      ):null}
    </div>
  );
}

function Reports(props) {
  var sh=props.shared,state=sh.state,fmt=sh.fmt,base=sh.base,rates=sh.rates,CATEGORIES=sh.CATEGORIES,accountsWithBalance=sh.accountsWithBalance;
  var netWorth=props.netWorth,monthIncome=props.monthIncome,monthExpenses=props.monthExpenses;
  var cats=CATEGORIES||DEFAULT_CATEGORIES;
  var byCategory=cats.map(function(cat){
    var spent=(state.transactions||[]).filter(function(t){return t.type==="expense"&&t.category===cat&&t.category!=="Transfer";}).reduce(function(s,t){return s+toBase(Number(t.amount),t.currency,base,rates);},0);
    return {cat:cat,spent:spent};
  }).filter(function(x){return x.spent>0;}).sort(function(a,b){return b.spent-a.spent;});
  var total=byCategory.reduce(function(s,x){return s+x.spent;},0);
  var last6=[],i,d,ym,inc,exp;
  for(i=5;i>=0;i--){
    d=new Date();d.setMonth(d.getMonth()-i);ym=d.toISOString().slice(0,7);
    inc=(state.transactions||[]).filter(function(t){return t.type==="income"&&t.date.startsWith(ym)&&t.category!=="Transfer";}).reduce(function(s,t){return s+toBase(Number(t.amount),t.currency,base,rates);},0);
    exp=(state.transactions||[]).filter(function(t){return t.type==="expense"&&t.date.startsWith(ym)&&t.category!=="Transfer";}).reduce(function(s,t){return s+toBase(Number(t.amount),t.currency,base,rates);},0);
    last6.push({ym:ym,inc:inc,exp:exp});
  }
  var maxVal=Math.max.apply(null,last6.map(function(m){return Math.max(m.inc,m.exp);}).concat([1]));
  return (
    <div>
      <h2 style={{margin:"0 0 1rem",fontSize:"16px",fontWeight:500}}>Reports</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px",marginBottom:"1.5rem"}}>
        <StatCard label="Net worth" value={fmt(netWorth,base)} />
        <StatCard label="Month income" value={fmt(monthIncome,base)} color="var(--color-text-success)" />
        <StatCard label="Month expenses" value={fmt(monthExpenses,base)} color="var(--color-text-danger)" />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        <div>
          <div style={{fontWeight:500,fontSize:"14px",marginBottom:"0.75rem"}}>Spending by category</div>
          {byCategory.length===0?<Empty text="No expense data yet" />:null}
          {byCategory.map(function(item){
            return (
              <div key={item.cat} style={{marginBottom:"8px"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",marginBottom:"3px"}}><span>{item.cat}</span><span style={{color:"var(--color-text-secondary)"}}>{fmt(item.spent,base)} · {total>0?((item.spent/total)*100).toFixed(0):0}%</span></div>
                <div style={{background:"var(--color-background-secondary)",borderRadius:"99px",height:"6px"}}><div style={{width:total>0?((item.spent/total)*100)+"%":"0%",background:"var(--color-text-primary)",height:"100%",borderRadius:"99px"}}></div></div>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{fontWeight:500,fontSize:"14px",marginBottom:"0.75rem"}}>Income vs expenses (6 months)</div>
          {last6.map(function(m){
            return (
              <div key={m.ym} style={{marginBottom:"8px"}}>
                <div style={{fontSize:"12px",color:"var(--color-text-secondary)",marginBottom:"3px"}}>{m.ym}</div>
                <div style={{display:"flex",gap:"4px",alignItems:"center"}}><div style={{flex:1,background:"var(--color-background-secondary)",borderRadius:"99px",height:"10px",overflow:"hidden"}}><div style={{height:"100%",background:"var(--color-background-success)",borderRadius:"99px",width:((m.inc/maxVal)*100)+"%"}}></div></div><span style={{fontSize:"11px",width:"80px",textAlign:"right",color:"var(--color-text-success)"}}>{fmt(m.inc,base)}</span></div>
                <div style={{display:"flex",gap:"4px",alignItems:"center",marginTop:"2px"}}><div style={{flex:1,background:"var(--color-background-secondary)",borderRadius:"99px",height:"10px",overflow:"hidden"}}><div style={{height:"100%",background:"var(--color-background-danger)",borderRadius:"99px",width:((m.exp/maxVal)*100)+"%"}}></div></div><span style={{fontSize:"11px",width:"80px",textAlign:"right",color:"var(--color-text-danger)"}}>{fmt(m.exp,base)}</span></div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{marginTop:"1.5rem"}}>
        <div style={{fontWeight:500,fontSize:"14px",marginBottom:"0.75rem"}}>Account balances</div>
        {accountsWithBalance.filter(function(a){return !a.hidden;}).map(function(a){
          return (
            <div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:"13px"}}>
              <span>{a.name} <span style={{color:"var(--color-text-secondary)",fontSize:"11px"}}>({a.type} · {a.currency})</span></span>
              <span style={{fontWeight:500,color:a.balance<0?"var(--color-text-danger)":"var(--color-text-primary)"}}>{fmt(a.balance,a.currency)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Settings(props) {
  var sh=props.shared,state=sh.state,update=sh.update,uid=sh.uid,CURRENCIES=sh.CURRENCIES,CATEGORIES=sh.CATEGORIES;
  var cats=CATEGORIES||DEFAULT_CATEGORIES;
  var [newCat,setNewCat]=useState("");
  var [editingCat,setEditingCat]=useState(null);
  var [editCatVal,setEditCatVal]=useState("");

  function addCategory() {
    var name=newCat.trim();
    if(!name||cats.indexOf(name)!==-1) return;
    update({categories:cats.concat([name])});
    setNewCat("");
  }
  function startEditCat(cat){setEditingCat(cat);setEditCatVal(cat);}
  function saveEditCat(cat) {
    var name=editCatVal.trim();
    if(!name||name===cat){setEditingCat(null);return;}
    var newCats=cats.map(function(c){return c===cat?name:c;});
    var newTxns=(state.transactions||[]).map(function(t){return t.category===cat?Object.assign({},t,{category:name}):t;});
    var newBudgets=(state.budgets||[]).map(function(b){return b.category===cat?Object.assign({},b,{category:name}):b;});
    update({categories:newCats,transactions:newTxns,budgets:newBudgets});
    setEditingCat(null);
  }
  function deleteCat(cat) {
    if(DEFAULT_CATEGORIES.indexOf(cat)!==-1) return;
    update({categories:cats.filter(function(c){return c!==cat;})});
  }

  return (
    <div>
      <h2 style={{margin:"0 0 1rem",fontSize:"16px",fontWeight:500}}>Settings</h2>
      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem",marginBottom:"1rem"}}>
        <div style={{fontWeight:500,marginBottom:"0.75rem",fontSize:"14px"}}>General</div>
        <Field label="Base currency">
          <Sel value={state.baseCurrency} onChange={function(e){update({baseCurrency:e.target.value});}} style={{maxWidth:"200px"}}>
            {CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}
          </Sel>
        </Field>
      </div>
      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem",marginBottom:"1rem"}}>
        <div style={{fontWeight:500,marginBottom:"0.75rem",fontSize:"14px"}}>Categories</div>
        {cats.map(function(cat){
          var isDefault=DEFAULT_CATEGORIES.indexOf(cat)!==-1;
          return (
            <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
              {editingCat===cat?(
                <div style={{display:"flex",gap:"6px",flex:1,marginRight:"8px"}}>
                  <Input value={editCatVal} onChange={function(e){setEditCatVal(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")saveEditCat(cat);if(e.key==="Escape")setEditingCat(null);}} style={{padding:"4px 8px",fontSize:"12px"}} />
                  <Btn small={true} variant="primary" onClick={function(){saveEditCat(cat);}}>Save</Btn>
                  <Btn small={true} onClick={function(){setEditingCat(null);}}>Cancel</Btn>
                </div>
              ):(
                <span style={{fontSize:"13px"}}>{cat}{isDefault?<span style={{fontSize:"10px",color:"var(--color-text-secondary)",marginLeft:"6px"}}>default</span>:null}</span>
              )}
              {editingCat!==cat?(
                <div style={{display:"flex",gap:"4px"}}>
                  <Btn small={true} onClick={function(){startEditCat(cat);}}><i className="ti ti-edit" style={{fontSize:"12px"}}></i>Edit</Btn>
                  {isDefault?null:<Btn small={true} onClick={function(){deleteCat(cat);}}><i className="ti ti-trash" style={{fontSize:"12px"}}></i>Del</Btn>}
                </div>
              ):null}
            </div>
          );
        })}
        <div style={{display:"flex",gap:"8px",marginTop:"0.75rem",alignItems:"center"}}>
          <Input value={newCat} onChange={function(e){setNewCat(e.target.value);}} placeholder="New category name" onKeyDown={function(e){if(e.key==="Enter")addCategory();}} style={{flex:1,padding:"6px 10px",fontSize:"13px"}} />
          <Btn onClick={addCategory} disabled={!newCat.trim()}><i className="ti ti-plus"></i>Add</Btn>
        </div>
      </div>
      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem"}}>
        <div style={{fontWeight:500,marginBottom:"0.75rem",fontSize:"14px"}}>Users</div>
        <UserAdder uid={uid} />
      </div>
    </div>
  );
}
