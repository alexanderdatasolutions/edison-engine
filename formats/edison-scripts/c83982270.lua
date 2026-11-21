--雲魔物－ポイズン・クラウド
--Cloudian - Poison Cloud
--Edison: does not activate if this card was face-down when it was attacked (2010 text, GLAS-EN009: "If this face-up card attacks or is attacked"; the same reading as Cyber Phoenix)
local s,id=GetID()
function s.initial_effect(c)
	--Edison: remember that this card was face-down when it was attacked
	local e0=Effect.CreateEffect(c)
	e0:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_CONTINUOUS)
	e0:SetProperty(EFFECT_FLAG_CANNOT_DISABLE)
	e0:SetCode(EVENT_FLIP)
	e0:SetOperation(function(e)
		local c=e:GetHandler()
		if Duel.IsDamageStep() and Duel.GetAttackTarget()==c then c:RegisterFlagEffect(id,RESET_PHASE|PHASE_DAMAGE,0,1) end
	end)
	c:RegisterEffect(e0)
	--destroy&damage
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetCategory(CATEGORY_DESTROY+CATEGORY_DAMAGE)
	e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
	e1:SetCode(EVENT_BATTLE_DESTROYED)
	e1:SetCondition(s.condition)
	e1:SetTarget(s.target)
	e1:SetOperation(s.operation)
	c:RegisterEffect(e1)
end
function s.condition(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	return c:IsLocation(LOCATION_GRAVE) and c:IsReason(REASON_BATTLE) and c:IsPreviousPosition(POS_FACEUP) and not c:HasFlagEffect(id)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	Duel.SetOperationInfo(0,CATEGORY_DESTROY,e:GetHandler():GetBattleTarget(),1,0,0)
	Duel.SetOperationInfo(0,CATEGORY_DAMAGE,nil,0,1-tp,800)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
	local bc=e:GetHandler():GetBattleTarget()
	if bc:IsFaceup() and bc:IsRelateToBattle() and Duel.Destroy(bc,REASON_EFFECT)~=0 then
		Duel.Damage(1-tp,800,REASON_EFFECT)
	end
end