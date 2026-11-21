--王家の眠る谷－ネクロバレー
--Necrovalley
--Edison: only effects that target a card in a Graveyard are negated; effects that do not target (Treeborn Frog, Rekindling, changing Types/Attributes in the Graveyard) are untouched (https://www.edisonformat.com/functional-errata.html)
local s,id=GetID()
function s.initial_effect(c)
	--Activate
	local e0=Effect.CreateEffect(c)
	e0:SetType(EFFECT_TYPE_ACTIVATE)
	e0:SetCode(EVENT_FREE_CHAIN)
	c:RegisterEffect(e0)
	--All "Gravekeeper's" monsters on the field gain 500 ATK/DEF
	local e1a=Effect.CreateEffect(c)
	e1a:SetType(EFFECT_TYPE_FIELD)
	e1a:SetCode(EFFECT_UPDATE_ATTACK)
	e1a:SetRange(LOCATION_FZONE)
	e1a:SetTargetRange(LOCATION_MZONE,LOCATION_MZONE)
	e1a:SetTarget(function(e,c) return c:IsSetCard(SET_GRAVEKEEPERS) end)
	e1a:SetValue(500)
	c:RegisterEffect(e1a)
	local e1b=e1a:Clone()
	e1b:SetCode(EFFECT_UPDATE_DEFENSE)
	c:RegisterEffect(e1b)
	--Cards in the GY cannot be banished
	local e2a=Effect.CreateEffect(c)
	e2a:SetType(EFFECT_TYPE_FIELD)
	e2a:SetCode(EFFECT_CANNOT_REMOVE)
	e2a:SetRange(LOCATION_FZONE)
	e2a:SetTargetRange(LOCATION_GRAVE,0)
	e2a:SetCondition(function(e) return not Duel.IsPlayerAffectedByEffect(e:GetHandler():GetControler(),EFFECT_NECRO_VALLEY_IM) end)
	c:RegisterEffect(e2a)
	local e2b=e2a:Clone()
	e2b:SetTargetRange(0,LOCATION_GRAVE)
	e2b:SetCondition(function(e) return not Duel.IsPlayerAffectedByEffect(1-e:GetHandler():GetControler(),EFFECT_NECRO_VALLEY_IM) end)
	c:RegisterEffect(e2b)
	--Negate an activated effect when it resolves if it targets a card in the GY
	local e4=Effect.CreateEffect(c)
	e4:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
	e4:SetCode(EVENT_CHAIN_SOLVING)
	e4:SetRange(LOCATION_FZONE)
	e4:SetOperation(s.disop)
	c:RegisterEffect(e4)
end
s.listed_series={SET_GRAVEKEEPERS}
function s.disfilter(c,re)
	return c:IsLocation(LOCATION_GRAVE) and c:IsRelateToEffect(re) and not Duel.IsPlayerAffectedByEffect(c:GetControler(),EFFECT_NECRO_VALLEY_IM)
end
function s.disop(e,tp,eg,ep,ev,re,r,rp)
	if not Duel.IsChainDisablable(ev) or re:GetHandler():IsHasEffect(EFFECT_NECRO_VALLEY_IM) then return end
	if not re:IsHasProperty(EFFECT_FLAG_CARD_TARGET) then return end
	local tg=Duel.GetChainInfo(ev,CHAININFO_TARGET_CARDS)
	if tg and tg:IsExists(s.disfilter,1,nil,re) then Duel.NegateEffect(ev) end
end
