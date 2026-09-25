"""Build reviewable JSON contracts. No executable rules in scenario content."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def obj(properties, required=None, additional=False):
    return {'type':'object','properties':properties,'required':required or list(properties),'additionalProperties':additional}
string={'type':'string','minLength':1}
boolean={'type':'boolean'}
flags={'type':'object','additionalProperties':boolean}
action=obj({**{k:string for k in ['id','label','explanation','source','next','open']},
    **{k:{'type':'integer','minimum':-100,'maximum':100} for k in ['loyalty','safety']},
    **{k:flags for k in ['when','flags','checks']},'critical':boolean,'close_timer':boolean},['id','label','explanation','source'])
schema=obj({'id':{'enum':['service','security']},'version':string,'title':string,'intro':string,
    'seconds':{'type':'integer','minimum':1,'maximum':600},'critical_timeout':boolean,
    'initial':{'type':'object','minProperties':1,'additionalProperties':string},
    'rubric':{'type':'object','minProperties':1,'additionalProperties':obj({'label':string,'competency':string,'default':boolean},['label','competency'])},
    'nodes':{'type':'object','minProperties':1,'additionalProperties':obj({'text':string,'actions':{'type':'array','items':action,'minItems':1}})}})
schema['$schema']='https://json-schema.org/draft/2020-12/schema'
dest=ROOT/'server/resources/contracts'
dest.mkdir(parents=True,exist_ok=True)
(dest/'scenario.schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2),encoding='utf-8')

def ref(name): return {'$ref':'#/components/schemas/'+name}
def arr(item): return {'type':'array','items':item}
integer={'type':'integer'}
nullable_number={'type':['number','null']}
schemas={
 'Scenario':obj({k:string for k in ['id','title','intro','version']}),
 'Command':obj({'request_id':{'type':'string','format':'uuid'},'expected_revision':{'type':'integer','minimum':0}}),
 'Action':obj({'id':string,'label':string}),
 'Thread':obj({'id':string,'text':string,'closed':boolean,'actions':arr(ref('Action'))}),
 'Competency':obj({'total':integer,'passed':integer,'status':{'enum':['observed','critical_failure']},'percent':nullable_number}),
 'Decision':obj({'action':string,'explanation':string,'source':string,'loyalty':integer,'safety':integer}),
 'Result':obj({'score':integer,'passed':boolean,'critical':boolean,'checks':flags,'rubric':schema['properties']['rubric'],'events':arr(ref('Decision')),'competencies':{'type':'object','additionalProperties':ref('Competency')}}),
 'Attempt':obj({'id':string,'server_time':{'type':'number'},'scenario':string,'version':string,'title':string,'mode':{'enum':['train','check']},'status':{'enum':['active','paused','completed']},'revision':integer,'loyalty':integer,'safety':integer,'deadline':nullable_number,'remaining':nullable_number,'threads':arr(ref('Thread')),'result':{'oneOf':[ref('Result'),{'type':'null'}]}}),
 'Profile':obj({'id':string,'name':string,'portrait':string,'brigade':string,'depot':string,'demo':boolean},additional=True),
 'Progress':obj({'permanent':integer,'bonus':integer,'total':integer,'level':integer,'awards':arr({'type':'object'}),'best':arr({'type':'object'}),'challenge':{'type':['object','null']},'bonuses':arr({'type':'object'}),'competencies':arr({'type':'object'}),'history':arr({'type':'object'})}),
 'Me':obj({'profile':ref('Profile'),'progress':ref('Progress'),'active_attempt':{'type':['string','null']}}),
 'Bootstrap':obj({'csrf':string,'profile':ref('Profile'),'progress':ref('Progress'),'active_attempt':{'type':['string','null']}}),
 'Notice':obj({'id':integer,'title':string,'read':boolean,'target':string},additional=True),
 'Rank':obj({'id':string,'name':string,'rank':integer,'total':integer,'permanent':integer,'brigade':string,'depot':string,'demo':boolean}),
 'Export':obj({'data':arr(obj({'id':string,'profile_id':string,'scenario':string,'version':string,'mode':string,'result':ref('Result'),'finished_at':string})),'next_cursor':{'type':['string','null']}},additional=True),
}
example={'id':'00000000-0000-4000-8000-000000000099','scenario':'service','version':'1','title':'Сервис и свободный проход','server_time':1790348400,'mode':'train','status':'active','revision':0,'loyalty':60,'safety':80,'deadline':None,'remaining':None,'threads':[{'id':'service','text':'Розетка не работает.','closed':False,'actions':[{'id':'apologize','label':'Извиниться и проверить решение'}]}],'result':None}
schemas['PracticeRecommendation']=obj({'id':string,'title':string,'reason':string,'before':arr(string)})
schemas['PracticeContext']=obj({'id':string,'source_attempt_id':string,'before':arr(string),'intro':string,'completed_steps':integer})
schemas['PracticeFocus']=obj({'label':string,'scenario':string,'version':string,'mode':string,'misses':integer,'observations':integer,'source_attempt_id':{'type':['string','null']},'exercise_id':{'type':['string','null']}})
schemas['PracticeHistory']=obj({'id':string,'title':string,'passed':boolean,'finished_at':string})
schemas['DecisionFeedback']=obj({'explanation':string,'loyalty_change':integer,'safety_change':integer})
schemas['Attempt']['properties'].update({'practice':{'oneOf':[ref('PracticeContext'),{'type':'null'}]},'practice_options':arr(ref('PracticeRecommendation')),'last_decision':{'oneOf':[ref('DecisionFeedback'),{'type':'null'}]}})
schemas['Attempt']['required'] += ['practice','practice_options','last_decision']
schemas['Progress']['properties'].update({'practice_history':arr(ref('PracticeHistory')),'practice_focus':arr(ref('PracticeFocus'))})
schemas['Progress']['required'] += ['practice_history','practice_focus']
schemas['Notice']['properties']['body']=string
schemas['Notice']['required'].append('body')
example.update({'practice':None,'practice_options':[],'last_decision':None})
paths={}
def endpoint(path,method,title,response,body=None,params=None,export=False,bootstrap=False):
 op={'summary':title,'responses':{'200':{'description':'Успешно','content':{'application/json':{'schema':response}}},'401':{'description':'Нет действующей сессии или ключа'},'404':{'description':'Запись отсутствует или принадлежит другому профилю'},'429':{'description':'Слишком много запросов'}},'security':[] if bootstrap else [{'ExportToken':[]}] if export else [{'Session':[]}]}
 if response==ref('Attempt'): op['responses']['200']['content']['application/json']['example']=example
 if params: op['parameters']=params
 if '{id}' in path: op.setdefault('parameters',[]).append({'name':'id','in':'path','required':True,'schema':string})
 if body:
  op['requestBody']={'required':True,'content':{'application/json':{'schema':body}}}
  op['parameters']=op.get('parameters',[])+[{'name':'X-CSRF-TOKEN','in':'header','required':True,'schema':string}]
  op['responses'].update({'419':{'description':'Сессия истекла либо неверный CSRF-токен'},'422':{'description':'Ошибка полей','content':{'application/json':{'example':{'message':'The given data was invalid.','errors':{'name':['Обязательное поле']}}}}}})
 if path.endswith(('/actions','/pause','/finish')):
  op['responses']['409']={'description':'Изменилась ревизия, действие недоступно или request_id использован с другим содержимым. Истёкшие сроки сохранены. Для state_conflict передано новое state.','content':{'application/json':{'examples':{'revision':{'value':{'error':{'code':'state_conflict','message':'Состояние обновилось. Повторите выбор.'},'state':example}},'duplicate':{'value':{'error':{'code':'idempotency_conflict','message':'Ключ уже использован'}}}}}}}
 paths.setdefault(path,{})[method]=op
endpoint('/bootstrap','get','Открыть гостевую сессию',ref('Bootstrap'),bootstrap=True)
endpoint('/me','get','Профиль и прогресс',ref('Me'))
endpoint('/me','patch','Изменить имя и портрет',ref('Me'),obj({'name':{'type':'string','minLength':2,'maxLength':40},'portrait':{'enum':['conductor_card','chief_card']}}))
endpoint('/scenarios','get','Последние учебные версии',arr(ref('Scenario')))
endpoint('/attempts','post','Начать или вернуть незавершённую попытку',ref('Attempt'),obj({'scenario':{'enum':['service','security']},'mode':{'enum':['train','check']},'seat':boolean}))
endpoint('/attempts/{id}','get','Состояние с обработанными сроками',ref('Attempt'))
endpoint('/attempts/{id}/practice','post','Начать рекомендованное упражнение по завершённой собственной смене; только обучение, без наград',ref('Attempt'),obj({'request_id':{'type':'string','format':'uuid'},'exercise_id':{'enum':['priority','communication','unattended']}}))
paths['/attempts/{id}/practice']['post']['responses']['409']={'description':'Есть незавершённое прохождение, упражнение не рекомендовано или ключ использован с другими данными. Повтор с прежним request_id возвращает первоначальные статус и тело.'}
for operation,extra in [('actions',{'thread_id':string,'action_id':string}),('pause',{'paused':boolean}),('finish',{})]:
 endpoint('/attempts/{id}/'+operation,'post',{'actions':'Выбрать действие','pause':'Установить паузу','finish':'Завершить смену'}[operation],ref('Attempt'),obj({**schemas['Command']['properties'],**extra}))
endpoint('/me/progress','get','Баллы, достижения и реальные прохождения',ref('Progress'))
endpoint('/leaderboard','get','Рейтинг выбранного подразделения',arr(ref('Rank')),params=[{'name':'scope','in':'query','required':True,'schema':{'enum':['brigade','depot','company']}}])
endpoint('/notifications','get','Уведомления профиля',arr(ref('Notice')))
endpoint('/notifications/{id}','patch','Отметить прочитанным',obj({'ok':boolean}),obj({},[]))
endpoint('/challenges/join','post','Вступить в испытание один раз',ref('Progress'),obj({},[]))
endpoint('/integrations/results','get','Экспорт для HR, LMS и учёта наград',ref('Export'),params=[{'name':'cursor','in':'query','schema':string}],export=True)
api={'openapi':'3.1.0','info':{'title':'Виртуальная смена ВСМ','version':'4.1','description':'Все изменения выполняются в локальном тренажёре. POST-команды идемпотентны по request_id внутри профиля. Проверки используют закреплённые версии; seat в проверке всегда true. ExportToken выдаётся локальной командой integration:token на 24 часа, только чтение. Реальной интеграции с кадровыми системами нет.'},'servers':[{'url':'http://127.0.0.1:8180/api/v1'}],'paths':paths,'components':{'schemas':schemas,'securitySchemes':{'Session':{'type':'apiKey','in':'cookie','name':'vsm-session'},'ExportToken':{'type':'http','scheme':'bearer'}}}}
(ROOT/'docs/openapi.json').write_text(json.dumps(api,ensure_ascii=False,indent=2),encoding='utf-8')
