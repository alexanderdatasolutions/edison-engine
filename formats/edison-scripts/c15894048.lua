--究極恐獣
--Ultimate Tyranno
--Edison: if it is in face-up Attack Position at the beginning of your Battle Phase, it must attack, and keep attacking until it has attacked every monster your opponent controls (https://www.edisonformat.com/rulings, Individual Card Rulings U-Z)
local s,id=GetID()
function s.initial_effect(c)
	--attack
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_FIELD)
	e1:SetCode(EFFECT_CANNOT_ATTACK)
	e1:SetRange(LOCATION_MZONE)
	e1:SetTargetRange(LOCATION_MZONE,0)
	e1:SetTarget(s.catg)
	e1:SetCondition(s.cacon)
	c:RegisterEffect(e1)
	local e3=Effect.CreateEffect(c)
	e3:SetType(EFFECT_TYPE_SINGLE)
	e3:SetCode(EFFECT_ATTACK_ALL)
	e3:SetValue(1)
	c:RegisterEffect(e3)
	--Edison: "it must attack first, and attack all monsters your opponent controls once each"
	local e4=Effect.CreateEffect(c)
	e4:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
	e4:SetCode(EVENT_PHASE_START+PHASE_BATTLE_START)
	e4:SetRange(LOCATION_MZONE)
	e4:SetCondition(function(e,tp) return Duel.IsTurnPlayer(tp) and e:GetHandler():IsPosition(POS_FACEUP_ATTACK) end)
	e4:SetOperation(function(e) e:GetHandler():RegisterFlagEffect(id,RESETS_STANDARD_PHASE_END,0,1) end)
	c:RegisterEffect(e4)
	local e5=Effect.CreateEffect(c)
	e5:SetType(EFFECT_TYPE_SINGLE)
	e5:SetProperty(EFFECT_FLAG_SINGLE_RANGE)
	e5:SetRange(LOCATION_MZONE)
	e5:SetCode(EFFECT_MUST_ATTACK)
	e5:SetCondition(s.mustcon)
	c:RegisterEffect(e5)
end
--it must attack the monsters the opponent controls; with none left it has attacked them all
function s.mustcon(e)
	local c=e:GetHandler()
	return c:GetFlagEffect(id)>0 and Duel.IsBattlePhase() and Duel.GetFieldGroupCount(c:GetControler(),0,LOCATION_MZONE)>0
end
s.listed_names={id}
function s.catg(e,c)
	return not c:IsCode(id)
end
function s.cfilter(c)
	if not c:IsFaceup() or not c:IsCode(id) or not c:CanAttack() then return false end
	local ag,direct=c:GetAttackableTarget()
	return #ag>0 or direct
end
function s.cacon(e)
	return Duel.IsBattlePhase() and Duel.IsExistingMatchingCard(s.cfilter,e:GetHandlerPlayer(),LOCATION_MZONE,0,1,nil)
end