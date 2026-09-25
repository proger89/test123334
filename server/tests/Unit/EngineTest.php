<?php
declare(strict_types=1);
namespace Tests\Unit;
use App\Game\{Engine,Scenario,AttemptState};
use PHPUnit\Framework\TestCase;
final class EngineTest extends TestCase {
 private function scenario(string $id='service'):Scenario{return Scenario::fromJson(file_get_contents((getenv('CONTENT_PATH')?:dirname(__DIR__,3).'/content').'/'.$id.'.json'));}
 private function service(bool $seat=true,bool $late=false,bool $rude=false):array {
  $d=$this->scenario();$e=new Engine;$s=$d->initialState('check',$seat,100);
  foreach([['service','apologize'],['service','check'],['service',$seat?'offer':'none'],['service','report'],['service','return']] as [$t,$a])$e->act($s,$d,$t,$a,101);
  self::assertSame('active',$s->status);self::assertArrayNotHasKey('baggage',$s->threads);
  $e->expire($s,$d,$late?170:121);$e->act($s,$d,'baggage','owner',$late?171:122);$e->act($s,$d,'baggage',$rude?'rude':'polite',$late?172:123);
  return [$s,$e->result($s,$d)];
 }
 public function test_correct_service():void{[$s,$r]=$this->service();self::assertSame(90,$s->loyalty);self::assertSame(100,$s->safety);self::assertSame(100,$r['score']);self::assertTrue($r['passed']);}
 public function test_no_seat_does_not_lose_checks():void{[$s,$r]=$this->service(false);self::assertSame(85,$s->loyalty);self::assertSame(100,$r['score']);self::assertTrue($r['passed']);}
 public function test_late_baggage_is_not_passed():void{[$s,$r]=$this->service(late:true);self::assertSame(85,$s->loyalty);self::assertSame(75,$s->safety);self::assertSame(89,$r['score']);self::assertFalse($r['passed']);}
 public function test_rude_action_loses_communication():void{[$s,$r]=$this->service(rude:true);self::assertSame(65,$s->loyalty);self::assertSame(89,$r['score']);self::assertTrue($r['passed']);}
 public function test_security_both_orders():void{foreach([['warn','notify'],['notify','warn']] as $order){$d=$this->scenario('security');$s=$d->initialState('check',true,100);$e=new Engine;foreach([...$order,'complete'] as $a)$e->act($s,$d,'security',$a,101);$r=$e->result($s,$d);self::assertTrue($r['passed']);self::assertSame(65,$s->loyalty);self::assertSame(100,$s->safety);}}
 public function test_security_timeout_never_displays_positive_safety():void{$d=$this->scenario('security');$s=$d->initialState('check',true,100);$e=new Engine;$e->expire($s,$d,135);$r=$e->result($s,$d);self::assertFalse($r['passed']);self::assertNull($r['competencies']['Безопасность']['percent']);$e->expire($s,$d,200);self::assertSame(50,$s->safety);}
 public function test_moving_unknown_bag_is_critical():void{$d=$this->scenario('security');$s=$d->initialState('check',true,100);$e=new Engine;$e->act($s,$d,'security','move',101);self::assertTrue($s->critical);self::assertFalse($e->result($s,$d)['passed']);}
 public function test_hidden_event_uses_original_schedule_after_late_wakeup():void{$d=$this->scenario();$s=$d->initialState('train',true,100);$e=new Engine;$e->act($s,$d,'service','apologize',101);$e->expire($s,$d,166);self::assertTrue($s->timedOut);self::assertSame(55,$s->safety);self::assertArrayHasKey('baggage',$s->threads);}
 public function test_no_future_rules_in_public_state():void{$d=$this->scenario();$s=$d->initialState('train',true,100);$view=(new Engine)->view($s,$d);self::assertArrayNotHasKey('flags',$view);self::assertArrayNotHasKey('checks',$view);self::assertArrayNotHasKey('eventAt',$view);self::assertArrayNotHasKey('explanation',$view['threads'][0]['actions'][0]);}
 public function test_state_round_trip():void{$s=$this->scenario()->initialState('train',false,100);self::assertEquals($s,AttemptState::restore($s->json()));}
}
