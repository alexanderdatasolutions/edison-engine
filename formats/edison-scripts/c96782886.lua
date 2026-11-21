--メンタルマスター
--Mind Master
--Edison: no once per turn, and "Mind Master" itself cannot be Tributed for the cost (2010 text, TDGS-EN016; the once per turn is a later errata: https://yugipedia.com/wiki/Card_Errata:Mind_Master)
local s,id=GetID()
function s.initial_effect(c)
	--You can pay 800 LP and Tribute 1 Psychic monster; Special Summon 1 Level 4 or lower Psychic monster from your Deck in Attack Position. You can only use this effect of "Mind Master" once per turn
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
	e1:SetType(EFFECT_TYPE_IGNITION)
	e1:SetRange(LOCATION_MZONE)
	e1:SetCost(Cost.AND(Cost.PayLP(800),s.spcost))
	e1:SetTarget(s.sptg)
	e1:SetOperation(s.spop)
	c:RegisterEffect(e1)
end
function s.costfilter(c)
	return c:IsRace(RACE_PSYCHIC) and not c:IsCode(id)
end
function s.spcost(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.CheckReleaseGroupCost(tp,s.costfilter,1,false,aux.ReleaseCheckMMZ,nil) end
	local g=Duel.SelectReleaseGroupCost(tp,s.costfilter,1,1,false,aux.ReleaseCheckMMZ,nil)
	Duel.Release(g,REASON_COST)
end
function s.spfilter(c,e,tp)
	return c:IsLevelBelow(4) and c:IsRace(RACE_PSYCHIC) and c:IsCanBeSpecialSummoned(e,0,tp,false,false,POS_FACEUP_ATTACK)
end
function s.sptg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.IsExistingMatchingCard(s.spfilter,tp,LOCATION_DECK,0,1,nil,e,tp) end
	Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,1,tp,LOCATION_DECK)
end
function s.spop(e,tp,eg,ep,ev,re,r,rp)
	if Duel.GetLocationCount(tp,LOCATION_MZONE)<=0 then return end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
	local g=Duel.SelectMatchingCard(tp,s.spfilter,tp,LOCATION_DECK,0,1,1,nil,e,tp)
	if #g>0 then
		Duel.SpecialSummon(g,0,tp,tp,false,false,POS_FACEUP_ATTACK)
	end
end