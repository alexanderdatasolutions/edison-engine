--邪神機－獄炎
--Malevolent Mech - Goku En
--Edison: resolves without effect if it is no longer the only Zombie-Type monster on the field, and activates again in the same End Phase when its activation is negated (https://www.edisonformat.com/rulings/individual-rulings-l-o)
local s,id=GetID()
function s.initial_effect(c)
	--summon
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetProperty(EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_UNCOPYABLE)
	e1:SetType(EFFECT_TYPE_SINGLE)
	e1:SetCode(EFFECT_SUMMON_PROC)
	e1:SetCondition(s.ntcon)
	e1:SetOperation(s.ntop)
	c:RegisterEffect(e1)
	--"If the activation of this effect is negated by "Light and Darkness Dragon," it will activate again in the same End Phase"
	aux.GlobalCheck(s,function()
		local ge1=Effect.GlobalEffect()
		ge1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
		ge1:SetCode(EVENT_CHAIN_NEGATED)
		ge1:SetOperation(s.negop)
		Duel.RegisterEffect(ge1,0)
	end)
end
function s.negop(e,tp,eg,ep,ev,re,r,rp)
	local rc=re:GetHandler()
	if not (rc:IsOriginalCode(id) and re:IsHasType(EFFECT_TYPE_TRIGGER_F) and re:GetCode()==EVENT_PHASE+PHASE_END) then return end
	if not (rc:IsLocation(LOCATION_MZONE) and rc:IsFaceup()) then return end
	local ct,max,ctcode=re:GetCountLimit()
	if re:IsHasProperty(EFFECT_FLAG_COUNT_LIMIT) and ct==0 and ctcode==0 then re:SetCountLimit(max) end
end
function s.ntcon(e,c,minc)
	if c==nil then return true end
	return minc==0 and c:GetLevel()>4 and Duel.GetLocationCount(c:GetControler(),LOCATION_MZONE)>0
end
function s.ntop(e,tp,eg,ep,ev,re,r,rp,c)
	--to grave
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,1))
	e1:SetCategory(CATEGORY_TOGRAVE)
	e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_F)
	e1:SetRange(LOCATION_MZONE)
	e1:SetCountLimit(1)
	e1:SetCode(EVENT_PHASE+PHASE_END)
	e1:SetCondition(s.tgcon)
	e1:SetTarget(s.tgtg)
	e1:SetOperation(s.tgop)
	e1:SetReset(RESET_EVENT|(RESETS_STANDARD|RESET_MSCHANGE|RESET_OVERLAY)&~(RESET_TOFIELD|RESET_LEAVE|RESET_TEMP_REMOVE))
	c:RegisterEffect(e1)
end
function s.tgcon(e,tp,eg,ep,ev,re,r,rp)
	return not Duel.IsExistingMatchingCard(aux.FaceupFilter(Card.IsRace,RACE_ZOMBIE),tp,LOCATION_MZONE,LOCATION_MZONE,1,e:GetHandler())
end
function s.tgtg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	Duel.SetOperationInfo(0,CATEGORY_TOGRAVE,e:GetHandler(),1,0,0)
end
function s.tgop(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	if c:IsRelateToEffect(e) and c:IsFaceup() and s.tgcon(e,tp,eg,ep,ev,re,r,rp) and Duel.SendtoGrave(c,REASON_EFFECT)~=0 then
		Duel.Damage(tp,2400,REASON_EFFECT)
	end
end