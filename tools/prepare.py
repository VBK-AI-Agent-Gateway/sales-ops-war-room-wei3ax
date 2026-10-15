#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sales Ops War Room — 数据准备（明确标注：模拟演示数据 / MOCK / DEMO ONLY）
- 生成 6 份脱敏模拟 CSV（客户匿名代号，无真实手机号/邮箱/身份证/合同编号）
- 清洗、合并、去重，统一日期(ISO)与金额(数值)格式
- 计算 KPI / 排名 / 漏斗 / 平均销售周期 / 逾期未跟进
- 识别 4 类风险 + 生成按优先级的行动清单
- 输出 public/data.json（脱敏产物，供前端渲染）
原始敏感数据不写入仓库；本脚本仅生成模拟演示数据。
"""
import csv, json, os, random, datetime as dt
from collections import defaultdict, Counter

random.seed(2025)
TODAY = dt.date(2025, 9, 25)  # Q3 复盘基准日（模拟）
OUT_RAW = "/ws/_raw_data"
OUT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "data.json")
os.makedirs(OUT_RAW, exist_ok=True)
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)

REPS = ["王*", "李*", "赵*", "陈*", "刘*"]
REGIONS = ["华北", "华东", "华南", "西南", "西北"]
STAGES = ["线索", "需求确认", "方案报价", "商务谈判", "赢单", "输单"]
STAGE_W = {"线索":0.10, "需求确认":0.25, "方案报价":0.45, "商务谈判":0.70, "赢单":1.0, "输单":0.0}
# 模拟客户匿名代号：区域 + 字母 + 序号，绝不出现真实公司名
acct_counter = Counter()
def anon_account(region):
    i = acct_counter[region] + 1
    acct_counter[region] = i
    return f"客户-{region}{chr(64 + ((i-1) % 26) + 1)}{i//26+1 if i>26 else ''}"

def money(lo, hi):
    return int(round(random.randint(lo, hi) / 1000.0) * 1000)

def dstr(d):  # 统一 ISO 日期
    return d.isoformat()

# ---------------- targets.csv ----------------
targets = []
for rep, region in zip(REPS, REGIONS):
    targets.append({"period":"2025-Q3", "rep":rep, "region":region,
                    "target_amount": money(1_200_000, 2_400_000)})
with open(f"{OUT_RAW}/targets.csv","w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f, fieldnames=["period","rep","region","target_amount"]); w.writeheader(); w.writerows(targets)

# ---------------- opportunities.csv ----------------
opps=[]
for rep, region in zip(REPS, REGIONS):
    n = random.randint(6, 9)
    for _ in range(n):
        stage = random.choices(STAGES, weights=[16,18,18,14,20,14])[0]
        created = TODAY - dt.timedelta(days=random.randint(15, 160))
        cycle_days = random.randint(12, 95)
        close = created + dt.timedelta(days=cycle_days)
        amount = money(60_000, 1_500_000)
        prob = STAGE_W[stage]
        # 最近活动：部分商机故意逾期未跟进
        if random.random() < 0.28:
            last = TODAY - dt.timedelta(days=random.randint(31, 60))  # >30 天未联系
        else:
            last = TODAY - dt.timedelta(days=random.randint(0, 25))
        # 部分临近关单缺下一步
        if close - TODAY <= dt.timedelta(days=10) and random.random() < 0.5:
            next_step = ""
        else:
            next_step = random.choice(["安排POC演示","发送报价单","高层拜访","确认法务条款","推进采购流程","约技术评审"])
        acct = anon_account(region)
        opps.append({
            "opp_id": f"O{len(opps)+1:04d}", "account": acct, "rep": rep, "region": region,
            "amount": amount, "stage": stage, "probability": f"{prob:.2f}",
            "created_date": dstr(created), "expected_close": dstr(close),
            "last_activity_date": dstr(last), "next_step": next_step,
        })
# 制造 2 条重复记录以验证去重
dup = dict(opps[3]); opps.append(dup)
with open(f"{OUT_RAW}/opportunities.csv","w",newline="",encoding="utf-8") as f:
    cols=["opp_id","account","rep","region","amount","stage","probability","created_date","expected_close","last_activity_date","next_step"]
    w=csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(opps)

# ---------------- activities.csv ----------------
acts=[]
for o in opps:
    for _ in range(random.randint(1,4)):
        d = dt.date.fromisoformat(o["last_activity_date"]) - dt.timedelta(days=random.randint(0,20))
        acts.append({"opp_id":o["opp_id"],"account":o["account"],"activity_date":dstr(d),
                     "type":random.choice(["电话","拜访","邮件","线上会议"]),"rep":o["rep"],
                     "summary":random.choice(["沟通预算与排期","演示产品能力","确认需求清单","跟进报价反馈","对接技术评估"])})
with open(f"{OUT_RAW}/activities.csv","w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f, fieldnames=["opp_id","account","activity_date","type","rep","summary"]); w.writeheader(); w.writerows(acts)

# ---------------- contracts.csv（合同编号匿名化为 C-序号，非真实编号） ----------------
contracts=[]
won=[o for o in opps if o["stage"]=="赢单"]
for i,o in enumerate(won, 1):
    signed = dt.date.fromisoformat(o["expected_close"])
    signed_amt = o["amount"]
    received = signed_amt if random.random()<0.55 else int(signed_amt*random.choice([0,0.3,0.5,0.7]))
    due = signed + dt.timedelta(days=random.choice([15,30,45]))
    overdue = received < signed_amt and due < TODAY
    renew = signed + dt.timedelta(days=365) if random.random()<0.5 else ""
    contracts.append({"contract_id":f"C-{i:03d}","account":o["account"],"rep":o["rep"],
        "signed_amount":signed_amt,"signed_date":dstr(signed),"billed":signed_amt,
        "received":received,"due_date":dstr(due),"renewal_date":dstr(renew) if renew else ""})
with open(f"{OUT_RAW}/contracts.csv","w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f, fieldnames=["contract_id","account","rep","signed_amount","signed_date","billed","received","due_date","renewal_date"]); w.writeheader(); w.writerows(contracts)

# ---------------- leads.csv ----------------
leads=[]
for o in opps:
    leads.append({"lead_id":f"L{len(leads)+1:04d}","source":random.choice(["官网","展会","转介绍","广告"]),
                  "account":o["account"],"created_date":o["created_date"],"rep":o["rep"],
                  "status":random.choice(["新","已转化","培育中","关闭"])})
with open(f"{OUT_RAW}/leads.csv","w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f, fieldnames=["lead_id","source","account","created_date","rep","status"]); w.writeheader(); w.writerows(leads)

# ---------------- notes.txt ----------------
with open(f"{OUT_RAW}/notes.txt","w",encoding="utf-8") as f:
    f.write("【模拟演示数据】Q3 销售复盘会纪要（脱敏）\n")
    f.write("- 华东区方案报价阶段集中，需加快商务谈判转化。\n")
    f.write("- 多个大额商机超 30 天未联系，区域负责人本周内跟进。\n")
    f.write("- 回款逾期集中在 7 月签约客户，财务与销售联合催收。\n")
    f.write("- 临近关单但缺下一步的商机需补齐行动计划。\n")

# ============ 清洗 / 合并 / 去重 / 归一 ============
# 去重：按 opp_id
seen=set(); uniq=[]
for o in opps:
    if o["opp_id"] in seen: continue
    seen.add(o["opp_id"]); uniq.append(o)
opps=uniq

# 归一金额为 int、日期为 date
for o in opps:
    o["amount"]=int(o["amount"]); o["probability"]=float(o["probability"])
    o["_cd"]=dt.date.fromisoformat(o["created_date"])
    o["_ec"]=dt.date.fromisoformat(o["expected_close"])
    o["_la"]=dt.date.fromisoformat(o["last_activity_date"])

# 目标
tgt_by_rep={t["rep"]:int(t["target_amount"]) for t in targets}
total_target=sum(tgt_by_rep.values())

# 已签约金额（赢单）
signed_total=sum(o["amount"] for o in opps if o["stage"]=="赢单")
# 加权管道（仅未关单商机）
open_opps=[o for o in opps if o["stage"] not in ("赢单","输单")]
weighted_pipe=sum(o["amount"]*o["probability"] for o in open_opps)
# 预测达成率 = (已签约 + 加权管道) / 目标
forecast=signed_total+weighted_pipe
attain=forecast/total_target if total_target else 0
gap=max(0, total_target-signed_total)

# 排名（按已签约 + 加权管道 = 预测贡献）
rep_perf=[]
for rep in REPS:
    s=sum(o["amount"] for o in opps if o["rep"]==rep and o["stage"]=="赢单")
    wpipe=sum(o["amount"]*o["probability"] for o in open_opps if o["rep"]==rep)
    tgt=tgt_by_rep.get(rep,0)
    pred=s+wpipe
    rep_perf.append({"rep":rep,"region":REGIONS[REPS.index(rep)],"target":tgt,"signed":s,
                     "weighted_pipe":round(wpipe),"forecast":round(pred),
                     "attain":round(pred/tgt,4) if tgt else 0})
rep_perf.sort(key=lambda x:-x["forecast"])

# 漏斗（阶段 数量/金额/转化率）
stage_stat=[]
prev_count=None
for st in STAGES:
    sel=[o for o in opps if o["stage"]==st]
    cnt=len(sel); amt=sum(o["amount"] for o in sel)
    conv = (cnt/prev_count) if prev_count else None  # 相对上一阶段数量转化
    stage_stat.append({"stage":st,"count":cnt,"amount":amt,
                       "conv": round(conv,4) if conv is not None else None})
    if st not in ("赢单","输单"): prev_count = cnt or prev_count

# 平均销售周期（赢单：签约日-创建日）
won_list=[o for o in opps if o["stage"]=="赢单"]
cycles=[(o["_ec"]-o["_cd"]).days for o in won_list]
avg_cycle=round(sum(cycles)/len(cycles),1) if cycles else 0

# 逾期未跟进商机（>30 天）
overdue_no_contact=[{"opp_id":o["opp_id"],"account":o["account"],"rep":o["rep"],"stage":o["stage"],
    "amount":o["amount"],"days":(TODAY-o["_la"]).days}
    for o in open_opps if (TODAY-o["_la"]).days>30]
overdue_no_contact.sort(key=lambda x:-x["days"])

# ============ 风险识别 ============
risks=[]
# 1) 高金额、低概率
for o in open_opps:
    if o["amount"]>=800_000 and o["probability"]<=0.45:
        risks.append({"type":"高金额低概率","level":"高","opp_id":o["opp_id"],"account":o["account"],
            "rep":o["rep"],"amount":o["amount"],"stage":o["stage"],"prob":o["probability"],
            "detail":f"金额 {o['amount']:,}，赢率仅 {int(o['probability']*100)}%"})
# 2) 超过30天未联系关键客户
for r in overdue_no_contact:
    if r["amount"]>=300_000:
        risks.append({"type":"超30天未联系","level":"高","opp_id":r["opp_id"],"account":r["account"],
            "rep":r["rep"],"amount":r["amount"],"stage":r["stage"],"prob":None,
            "detail":f"已 {r['days']} 天未联系"})
# 3) 预计关单临近但下一步缺失
for o in open_opps:
    if (o["_ec"]-TODAY).days<=10 and not o["next_step"]:
        risks.append({"type":"临近关单缺下一步","level":"中","opp_id":o["opp_id"],"account":o["account"],
            "rep":o["rep"],"amount":o["amount"],"stage":o["stage"],"prob":o["probability"],
            "detail":f"预计 {(o['_ec']-TODAY).days} 天内关单但无下一步行动"})
# 4) 回款逾期 / 续约风险
for c in contracts:
    due=dt.date.fromisoformat(c["due_date"]); recv=int(c["received"]); amt=int(c["signed_amount"])
    if recv<amt and due<TODAY:
        risks.append({"type":"回款逾期","level":"高","opp_id":c["contract_id"],"account":c["account"],
            "rep":c["rep"],"amount":amt-recv,"stage":"已签约","prob":None,
            "detail":f"逾期 {(TODAY-due).days} 天未回款 {amt-recv:,}"})
    if c["renewal_date"]:
        rd=dt.date.fromisoformat(c["renewal_date"])
        if (rd-TODAY).days<=90:
            risks.append({"type":"续约风险","level":"中","opp_id":c["contract_id"],"account":c["account"],
                "rep":c["rep"],"amount":amt,"stage":"续约","prob":None,
                "detail":f"{(rd-TODAY).days} 天后到期续约"})

# ============ 行动清单（按优先级） ============
def prio(r):
    order={"高":0,"中":1,"低":2}
    return (order.get(r["level"],3), -r.get("amount",0))
actions=[]
for r in sorted(risks, key=prio)[:12]:
    if r["type"]=="高金额低概率":
        act="拉通售前做赢率复盘，补强方案并锁定关键决策人"; due=TODAY+dt.timedelta(days=3)
    elif r["type"]=="超30天未联系":
        act="48小时内安排回访，重激活商机并更新下一步"; due=TODAY+dt.timedelta(days=2)
    elif r["type"]=="临近关单缺下一步":
        act="补齐下一步行动与截止日期，商务介入推进"; due=TODAY+dt.timedelta(days=2)
    elif r["type"]=="回款逾期":
        act="财务+销售联合催收，确认回款计划"; due=TODAY+dt.timedelta(days=3)
    else:
        act="发起续约沟通，输出续约方案"; due=TODAY+dt.timedelta(days=7)
    actions.append({"priority":r["level"],"type":r["type"],"action":act,"owner":r["rep"],
        "account":r["account"],"opp_id":r["opp_id"],"due":dstr(due),"reason":r["detail"],"amount":r.get("amount",0)})
actions.sort(key=lambda x: (0 if x["priority"]=="高" else 1))

# ============ 输出 data.json（脱敏、标注模拟） ============
data={
    "meta":{
        "title":"Sales Ops War Room",
        "period":"2025-Q3",
        "asOf": dstr(TODAY),
        "dataFlag":"模拟演示数据 (MOCK / DEMO ONLY)",
        "disclaimer":"本页数据为模拟演示数据，客户名称已匿名化，不含任何真实手机号/邮箱/身份证/合同编号。",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    },
    "kpi":{
        "quarterTarget": total_target,
        "signedAmount": signed_total,
        "weightedPipeline": round(weighted_pipe),
        "forecastAttainment": round(attain,4),
        "gap": gap,
        "avgSalesCycleDays": avg_cycle,
        "openOpps": len(open_opps),
        "overdueNoContact": len(overdue_no_contact),
    },
    "reps": rep_perf,
    "funnel": stage_stat,
    "risks": sorted(risks, key=prio),
    "actions": actions,
    "overdue": overdue_no_contact,
}
with open(OUT_JSON,"w",encoding="utf-8") as f:
    json.dump(data,f,ensure_ascii=False,indent=2)

print("OK data.json ->", OUT_JSON)
print("KPI:", json.dumps(data["kpi"], ensure_ascii=False))
print("reps:", len(rep_perf), "funnel:", len(stage_stat), "risks:", len(risks), "actions:", len(actions))
print("de-dup: raw=%d uniq=%d" % (len(opps)+0, len(opps)))
# 简单脱敏断言：输出中不得出现 @ 或 11 位数字手机号
raw=open(OUT_JSON,encoding="utf-8").read()
import re
assert "@" not in raw, "发现疑似邮箱"
assert not re.search(r"(?<!\d)1[3-9]\d{9}(?!\d)", raw), "发现疑似手机号"
print("PII check: PASS (no email / no mobile)")