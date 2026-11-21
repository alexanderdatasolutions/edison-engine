--運命の火時計
--Pyro Clock of Destiny
--Edison: moves forward every turn count on the field by 1, not one chosen (2010 text: "Move the turn count forward by 1 turn.")
local s,id=GetID()
function s.initial_effect(c)
	--Activate
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_ACTIVATE)
	e1:SetCode(EVENT_FREE_CHAIN)
	e1:SetTarget(s.target)
	e1:SetOperation(s.activate)
	c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.IsExistingMatchingCard(Card.IsHasEffect,tp,LOCATION_ALL,LOCATION_ALL,1,nil,id) end
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
	local g=Duel.GetMatchingGroup(Card.IsHasEffect,tp,LOCATION_ALL,LOCATION_ALL,nil,id)
	local all={}
	for tc in g:Iter() do
		for _,te in ipairs({tc:GetCardEffect(id)}) do table.insert(all,te) end
	end
	for _,te in ipairs(all) do
		local op=te:GetOperation()
		op(te,te:GetOwnerPlayer(),nil,0,id,nil,0,0)
	end
end
