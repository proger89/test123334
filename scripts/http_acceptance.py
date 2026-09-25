"""Real HTTP checks against the isolated acceptance Compose project on 8181."""
import concurrent.futures as pool
import http.cookiejar
import json
import statistics
import subprocess
import time
import urllib.request
import urllib.error
import uuid
from pathlib import Path

BASE='http://127.0.0.1:8181/api/v1'
COMPOSE=['docker','compose','-p','vsm-hackathon-acceptance','-f','compose.yaml','-f','compose.acceptance.yaml']
report={}
class Session:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar()
        self.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf=''
        _,data,_=self.call('/bootstrap')
        self.csrf=data['csrf'];self.profile=data['profile']['id']
    def call(self,path,method='GET',body=None,csrf=True):
        headers={'Accept':'application/json','Content-Type':'application/json'}
        if csrf:headers['X-CSRF-TOKEN']=self.csrf
        request=urllib.request.Request(BASE+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
        start=time.perf_counter()
        try: response=self.client.open(request,timeout=15)
        except urllib.error.HTTPError as error:response=error
        text=response.read().decode()
        return response.status,json.loads(text),(time.perf_counter()-start)*1000
    def start(self,mode='check'):
        code,a,_=self.call('/attempts','POST',{'scenario':'security','mode':mode,'seat':True});assert code==200,(code,a);return a
    def action(self,a,action,key=None):
        return self.call('/attempts/'+a['id']+'/actions','POST',{'request_id':key or str(uuid.uuid4()),'expected_revision':a['revision'],'thread_id':'security','action_id':action})

s=Session();a=s.start();key=str(uuid.uuid4())
with pool.ThreadPoolExecutor(max_workers=10) as executor:
    # Separate HTTP connections share the one session cookie; the DB profile lock serializes commands.
    def duplicate(_):
        clone=object.__new__(Session);clone.jar=s.jar;clone.csrf=s.csrf
        clone.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(s.jar))
        return clone.action(a,'warn',key)
    results=list(executor.map(duplicate,range(10)))
assert all(code==200 and body==results[0][1] for code,body,_ in results)
assert results[0][1]['loyalty']==65
report['concurrent_identical_commands']=10
code,_,_=s.call('/attempts','POST',{'scenario':'security','mode':'check','seat':True},csrf=False)
assert code==419;report['csrf_without_token']=code
other=Session();assert other.call('/attempts/'+a['id'])[0]==404
report['owner_isolation']=True

# A repeated start must not create multiple exercises, even on independent connections.
practice_session=Session();source=practice_session.start()
code,source,_=practice_session.action(source,'move');assert code==200
practice_key=str(uuid.uuid4())
practice_body={'request_id':practice_key,'exercise_id':'unattended'}
practice_url='/attempts/'+source['id']+'/practice'
with pool.ThreadPoolExecutor(max_workers=10) as executor:
    def duplicate_practice(_):
        clone=object.__new__(Session);clone.jar=practice_session.jar;clone.csrf=practice_session.csrf
        clone.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(clone.jar))
        return clone.call(practice_url,'POST',practice_body)
    started_practices=list(executor.map(duplicate_practice,range(10)))
assert all(code==200 and body==started_practices[0][1] for code,body,_ in started_practices)
assert practice_session.call(practice_url,'POST',practice_body,csrf=False)[0]==419
practice=started_practices[0][1]
for choice in ['notify','warn']:
    code,practice,_=practice_session.call('/attempts/'+practice['id']+'/actions','POST',{'request_id':str(uuid.uuid4()),'expected_revision':practice['revision'],'thread_id':'practice','action_id':choice})
    assert code==200,(code,practice)
assert practice['result']['passed']
practice_progress=practice_session.call('/me/progress')[1]
assert practice_progress['permanent']==0 and len(practice_progress['practice_history'])==1
assert practice_session.call('/attempts/'+source['id'])[1]['result']==source['result']
report['concurrent_identical_practice_starts']=10
report['practice_preserves_source_and_ranking']=True
times=[]
def session_run(_):
    session=Session();timings=[]
    for repeat in range(3):
        attempt=session.start()
        for action in ['warn','notify','complete']:
            code,attempt,elapsed=session.action(attempt,action);assert code==200,(code,attempt)
            timings.append(elapsed)
    return timings
with pool.ThreadPoolExecutor(max_workers=10) as executor:
    for measurements in executor.map(session_run,range(10)):times.extend(measurements)
report['action_requests']=len(times)
report['concurrent_sessions']=10
report['p95_action_ms']=round(sorted(times)[int(len(times)*.95)-1],1)
report['max_action_ms']=round(max(times),1)
assert report['p95_action_ms']<500,report
print(json.dumps(report,ensure_ascii=False),flush=True)

bonus=Session()
subprocess.run(COMPOSE+['exec','-T','api','php','artisan','demo:bonus-expiry',bonus.profile],check=True,capture_output=True)
assert bonus.call('/me/progress')[1]['bonus']==20
bonus_started=time.monotonic()
subprocess.run(COMPOSE+['stop','worker'],check=True,capture_output=True)
try:
    waiting=Session();waiting_attempt=waiting.start()
    time.sleep(36)
finally:
    subprocess.run(COMPOSE+['up','-d','--wait','worker'],check=True,capture_output=True)
recovered=waiting.call('/attempts/'+waiting_attempt['id'])[1]
assert recovered['status']=='completed' and recovered['result']['critical']
report['worker_recovery_after_deadline']=True
notices=bonus.call('/notifications')[1]
assert any('Скоро истекут' in n['title'] for n in notices)
report['expiry_warning']=True
time.sleep(max(0,92-(time.monotonic()-bonus_started)))
assert bonus.call('/me/progress')[1]['bonus']==0
assert any('баллов истёк' in n['title'] for n in bonus.call('/notifications')[1])
report['real_90_second_bonus_expired']=True
before=s.call('/me/progress')[1]
subprocess.run(COMPOSE+['stop'],check=True,capture_output=True)
subprocess.run(COMPOSE+['up','-d','--wait','web','worker'],check=True,capture_output=True)
assert s.call('/me/progress')[1]['permanent']==before['permanent']
assert s.call('/me')[1]['profile']['id']==s.profile
report['restart_preserves_profile_and_progress']=True
Path('tmp/http-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
