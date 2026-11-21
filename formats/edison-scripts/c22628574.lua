--フェイク・フェザー
--Fake Feather
--Edison: "Fake Feather" targets the Normal Trap Card when it is activated; the copied effect's targets are chosen when it resolves (https://www.edisonformat.com/rulings/individual-rulings-f-h)
local s,id=GetID()
function s.initial_effect(c)
	--Copy the Effects of a Normal Trap card
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_ACTIVATE)
	e1:SetCode(EVENT_FREE_CHAIN)
	e1:SetHintTiming(TIMING_DRAW_PHASE|TIMINGS_CHECK_MONSTER_E,TIMING_DRAW_PHASE|TIMINGS_CHECK_MONSTER_E)
	e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
	e1:SetCost(s.cost)
	e1:SetTarget(s.target)
	e1:SetOperation(s.operation)
	c:RegisterEffect(e1)
end
s.listed_names={id}
s.listed_series={SET_BLACKWING}
function s.cfilter(c)
	return c:IsSetCard(SET_BLACKWING) and c:IsMonster() and c:IsAbleToGraveAsCost()
end
function s.cost(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.IsExistingMatchingCard(s.cfilter,tp,LOCATION_HAND,0,1,nil) end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_TOGRAVE)
	local g=Duel.SelectMatchingCard(tp,s.cfilter,tp,LOCATION_HAND,0,1,1,nil)
	Duel.SendtoGrave(g,REASON_COST)
end
function s.filter(c)
	return c:IsNormalTrap() and not c:IsCode(id) and c:CheckActivateEffect(false,true,false)~=nil
end
--Edison: target the Normal Trap at activation; its own timing is checked now, its targets are chosen at resolution
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
	if chkc then return chkc:IsLocation(LOCATION_GRAVE) and chkc:IsControler(1-tp) and s.filter(chkc) end
	if chk==0 then return Duel.IsExistingTarget(s.filter,tp,0,LOCATION_GRAVE,1,nil) end
	Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,0))
	local g=Duel.SelectTarget(tp,s.filter,tp,0,LOCATION_GRAVE,1,1,nil)
	local te,teg,tep,tev,tre,tr,trp=g:GetFirst():CheckActivateEffect(false,true,true)
	e:SetLabelObject(te)
	s[e]={teg,tep,tev,tre,tr,trp}
	Duel.ClearOperationInfo(0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
	local tc=Duel.GetFirstTarget()
	local te=e:GetLabelObject()
	local ev_=s[e]
	s[e]=nil
	if not (te and ev_ and tc and tc:IsRelateToEffect(e)) then return end
	local teg,tep,tev,tre,tr,trp=table.unpack(ev_)
	local tg=te:GetTarget()
	if tg then
		if not tg(e,tp,teg,tep,tev,tre,tr,trp,0) then return end
		Duel.ClearTargetCard()
		e:SetProperty(te:GetProperty())
		tg(e,tp,teg,tep,tev,tre,tr,trp,1)
		e:SetProperty(EFFECT_FLAG_CARD_TARGET)
	end
	local op=te:GetOperation()
	if op then op(e,tp,teg,tep,tev,tre,tr,trp) end
end
