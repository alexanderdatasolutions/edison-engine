--禁止令
--Prohibition
--Edison: a card on the field when this card is activated stays unaffected, also after it leaves the field for the Graveyard or is removed from play, until it goes to the hand, the Deck or the field again (2010 text: "Cards on the field before this card was activated are not affected"; edisonformat.com rulings P-R: "can't activate its effects in the Graveyard, unless it was on the field before "Prohibition"")
local s,id=GetID()
function s.initial_effect(c)
	--Activate
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_ACTIVATE)
	e1:SetCode(EVENT_FREE_CHAIN)
	e1:SetTarget(s.target)
	e1:SetOperation(s.activate)
	c:RegisterEffect(e1)
	--forbidden
	local e2=Effect.CreateEffect(c)
	e2:SetType(EFFECT_TYPE_FIELD)
	e2:SetProperty(EFFECT_FLAG_SET_AVAILABLE)
	e2:SetCode(EFFECT_FORBIDDEN)
	e2:SetRange(LOCATION_SZONE)
	e2:SetTargetRange(0x7f,0x7f)
	e2:SetTarget(s.bantg)
	e2:SetLabelObject(e1)
	c:RegisterEffect(e2)
end
--Was `c` on the field when this copy of Prohibition was activated (and has not been to the hand, the Deck or the field since)?
function s.before(c,fid)
	for _,label in ipairs({c:GetFlagEffectLabel(id)}) do
		if label==fid then return true end
	end
	return false
end
function s.bantg(e,c)
	local ac=e:GetLabelObject():GetLabel()
	return ac~=0 and c:IsOriginalCodeRule(ac) and not s.before(c,e:GetHandler():GetFieldID())
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	e:SetLabel(0)
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_CODE)
	local ac=Duel.AnnounceCard(tp)
	Duel.SetTargetParam(ac)
	Duel.SetOperationInfo(0,CATEGORY_ANNOUNCE,nil,0,tp,ANNOUNCE_CARD)
	--"Cards on the field before this card was activated": every card on the field now, face-up or face-down
	local fid=e:GetHandler():GetFieldID()
	for tc in Duel.GetFieldGroup(tp,LOCATION_ONFIELD,LOCATION_ONFIELD):Iter() do
		tc:RegisterFlagEffect(id,RESET_EVENT|RESET_TOFIELD|RESET_TOHAND|RESET_TODECK|RESET_OVERLAY,0,1,fid)
	end
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
	local ac=Duel.GetChainInfo(0,CHAININFO_TARGET_PARAM)
	e:SetLabel(ac)
	e:GetHandler():SetHint(CHINT_CARD,ac)
	Duel.AdjustInstantly(e:GetHandler())
end
