--パペット・キング
--Puppet King
--Edison: any Monster Card the opponent adds to their hand except by drawing, not only from the Deck (2010 text: "When your opponent adds a Monster Card(s) to their hand, except by drawing")
local s,id=GetID()
function s.initial_effect(c)
	--Special Summon: a card added from the Deck is revealed (EVENT_TOHAND_CONFIRM)
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
	e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O)
	e1:SetCode(EVENT_TOHAND_CONFIRM)
	e1:SetRange(LOCATION_HAND)
	e1:SetCondition(s.spcon(LOCATION_DECK))
	e1:SetTarget(s.sptg)
	e1:SetOperation(s.spop)
	c:RegisterEffect(e1)
	--a card added from the Graveyard or from among removed cards is public as it moves
	local e3=e1:Clone()
	e3:SetCode(EVENT_TO_HAND)
	e3:SetCondition(s.spcon(LOCATION_GRAVE|LOCATION_REMOVED))
	c:RegisterEffect(e3)
	--Destroy
	local e2=Effect.CreateEffect(c)
	e2:SetDescription(aux.Stringid(id,1))
	e2:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_F)
	e2:SetCode(EVENT_PHASE+PHASE_END)
	e2:SetRange(LOCATION_MZONE)
	e2:SetCountLimit(1)
	e2:SetCondition(s.descon)
	e2:SetOperation(s.desop)
	c:RegisterEffect(e2)
	e1:SetLabelObject(e2)
	e3:SetLabelObject(e2)
end
function s.cfilter(c,tp,loc)
	return c:IsControler(1-tp) and c:IsPreviousLocation(loc) and not c:IsReason(REASON_DRAW)
		and c:IsMonster() and c:IsPreviousControler(1-tp)
end
function s.spcon(loc)
	return function(e,tp,eg,ep,ev,re,r,rp)
		return eg:IsExists(s.cfilter,1,nil,tp,loc)
	end
end
function s.sptg(e,tp,eg,ep,ev,re,r,rp,chk)
	local c=e:GetHandler()
	if chk==0 then return Duel.GetLocationCount(tp,LOCATION_MZONE)>0
		and c:IsCanBeSpecialSummoned(e,0,tp,false,false) end
	Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,c,1,0,0)
end
function s.spop(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	if not c:IsRelateToEffect(e) then return end
	if Duel.SpecialSummon(c,0,tp,tp,false,false,POS_FACEUP)>0 then
		local des_eff=e:GetLabelObject()
		local ct=Duel.IsTurnPlayer(tp) and 2 or 1
		c:RegisterFlagEffect(id,RESETS_STANDARD_PHASE_END|RESET_SELF_TURN,0,ct)
		des_eff:SetLabel(Duel.GetTurnCount()+ct)
	end
end
function s.descon(e,tp,eg,ep,ev,re,r,rp)
	return e:GetHandler():GetFlagEffect(id)>0 and Duel.GetTurnCount()==e:GetLabel()
end
function s.desop(e,tp,eg,ep,ev,re,r,rp)
	e:SetLabel(0)
	Duel.Destroy(e:GetHandler(),REASON_EFFECT)
end
