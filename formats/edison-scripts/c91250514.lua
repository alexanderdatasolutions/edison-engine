--タン・ツイスター
--Tongue Twister
--Edison: only when it was Tribute Summoned face-up; a Tribute Set does not count (https://www.edisonformat.com/rulings, Individual Card Rulings S-T)
local s,id=GetID()
function s.initial_effect(c)
	--draw
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetCategory(CATEGORY_DRAW)
	e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
	e1:SetCode(EVENT_TO_GRAVE)
	e1:SetCondition(s.condition)
	e1:SetTarget(s.target)
	e1:SetOperation(s.operation)
	c:RegisterEffect(e1)
	--remember a Tribute Summon (a Set raises no Summon event); kept while it is flipped face-down and until it has left the Graveyard
	local e2=Effect.CreateEffect(c)
	e2:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_CONTINUOUS)
	e2:SetProperty(EFFECT_FLAG_CANNOT_DISABLE)
	e2:SetCode(EVENT_SUMMON_SUCCESS)
	e2:SetOperation(s.regop)
	c:RegisterEffect(e2)
end
function s.regop(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	if c:IsTributeSummoned() then
		c:RegisterFlagEffect(id,RESET_EVENT|(RESETS_STANDARD&~(RESET_TOGRAVE|RESET_LEAVE|RESET_TURN_SET)),0,1)
	end
end
function s.condition(e,tp,eg,ep,ev,re,r,rp)
	return e:GetHandler():IsPreviousLocation(LOCATION_ONFIELD)
		and e:GetHandler():GetFlagEffect(id)>0
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	Duel.SetOperationInfo(0,CATEGORY_DRAW,nil,0,tp,2)
	Duel.SetOperationInfo(0,CATEGORY_REMOVE,e:GetHandler(),1,0,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
	Duel.Draw(tp,2,REASON_EFFECT)
	Duel.BreakEffect()
	if e:GetHandler():IsRelateToEffect(e) and not Duel.IsPlayerAffectedByEffect(e:GetHandlerPlayer(),CARD_SPIRIT_ELIMINATION) then
		Duel.Remove(e:GetHandler(),POS_FACEUP,REASON_EFFECT)
	end
end