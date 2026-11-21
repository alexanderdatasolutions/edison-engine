--月の女戦士
--Penumbral Soldier Lady
--Edison: the ATK gain is a Trigger Effect in the Damage Step that can be chained to, lasting until the end of the Damage Step (edisonformat.com rulings P-R: ""Penumbral Soldier Lady"'s ATK increases during the Damage Step and this effect can be chained to.")
local s,id=GetID()
function s.initial_effect(c)
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetCategory(CATEGORY_ATKCHANGE)
	e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
	e1:SetProperty(EFFECT_FLAG_DAMAGE_STEP)
	e1:SetCode(EVENT_BATTLE_CONFIRM)
	e1:SetCondition(s.condtion)
	e1:SetOperation(s.operation)
	c:RegisterEffect(e1)
end
function s.condtion(e)
	local c=e:GetHandler()
	local bc=c:GetBattleTarget()
	return bc and bc:IsFaceup() and bc:IsAttribute(ATTRIBUTE_LIGHT)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	if c:IsFaceup() and c:IsRelateToEffect(e) and c:IsRelateToBattle() then
		local e1=Effect.CreateEffect(c)
		e1:SetType(EFFECT_TYPE_SINGLE)
		e1:SetCode(EFFECT_UPDATE_ATTACK)
		e1:SetValue(1000)
		e1:SetReset(RESET_EVENT|RESETS_STANDARD|RESET_PHASE|PHASE_DAMAGE)
		c:RegisterEffect(e1)
	end
end
