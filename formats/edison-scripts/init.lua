--Edison rules that belong to a group of cards rather than to one card. Loaded once per duel, after utility.lua.
--Source: https://www.edisonformat.com/functional-errata.html

--"Lumina, Lightsworn Summoner (and all Lightsworns)", "Judgment Dragon", "Susa Soldier (and all Spirit Monsters)":
--their mandatory Trigger Effect in the End Phase activates again when its activation is negated (by "Light and
--Darkness Dragon"), until it resolves. Resolving with its effect negated ("Skill Drain") counts as resolving.
do
	local CARD_JUDGMENT_DRAGON=57774843
	local e1=Effect.GlobalEffect()
	e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
	e1:SetCode(EVENT_CHAIN_NEGATED)
	e1:SetOperation(function(e,tp,eg,ep,ev,re,r,rp)
		local code=re:GetCode()
		if not re:IsHasType(EFFECT_TYPE_TRIGGER_F) or code<EVENT_PHASE or code>=EVENT_PHASE_START then return end
		local rc=re:GetHandler()
		if not (rc:IsLocation(LOCATION_MZONE) and rc:IsFaceup()) then return end
		if rc:IsType(TYPE_SPIRIT) then
			--proc_spirit.lua clears this flag when the return activates
			rc:RegisterFlagEffect(FLAG_SPIRIT_RETURN,RESETS_STANDARD_PHASE_END,0,1)
		elseif rc:IsSetCard(SET_LIGHTSWORN) or rc:IsOriginalCode(CARD_JUDGMENT_DRAGON) then
			local ct,max,ctcode=re:GetCountLimit()
			if re:IsHasProperty(EFFECT_FLAG_COUNT_LIMIT) and ct==0 and ctcode==0 then re:SetCountLimit(max) end
		end
	end)
	Duel.RegisterEffect(e1,0)
end

--"Machina Gearframe (and all Union Monsters)": every Union monster has "A monster can only be equipped with 1 Union
--Monster at a time". Upstream calls that `oldequip` and sets it per card; each card keeps its own protection clause,
--except the three whose 2010 text protects from destruction by battle only (upstream: `oldprotect`), per
--https://www.edisonformat.com/rulings/rules-u-z ("If the equipped monster would be destroyed by battle, ...").
do
	local battle_only={[65622692]=true,[64500000]=true,[96300057]=true} --Y-Dragon Head, Z-Metal Tank, W-Wing Catapult
	local add=Auxiliary.AddUnionProcedure
	function Auxiliary.AddUnionProcedure(c,f,oldequip,oldprotect)
		if oldprotect==nil then oldprotect=oldequip end
		return add(c,f,true,(oldprotect or battle_only[c:GetOriginalCode()]) and true or false)
	end
end

--Rule 11, https://www.edisonformat.com/edison-rule-differences.html : "players can't respond to the end-of-turn discard
--for hand size at all, as this must be the last action a player performs in a turn. However, when a mandatory Trigger
--Effect is triggered by this discard, a chain will be built with special properties: Spell Speed 2 effects can be Chained
--here IF (and only if) they negate activations or effects. Spell Speed 3 effects can be Chained here". Example 2: the
--optional Trigger Effects of the discarded cards cannot be activated. The core already opens no free chain after the
--discard (core.hand_adjusted); this adds the rest from the discard until the turn ends.
do
	local adjusted=false
	local e1=Effect.GlobalEffect()
	e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
	e1:SetCode(EVENT_TO_GRAVE)
	e1:SetOperation(function(e,tp,eg) if eg:IsExists(Card.IsReason,1,nil,REASON_ADJUST) then adjusted=true end end)
	Duel.RegisterEffect(e1,0)
	local e2=Effect.GlobalEffect()
	e2:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
	e2:SetCode(EVENT_TURN_END)
	e2:SetOperation(function() adjusted=false end)
	Duel.RegisterEffect(e2,0)
	local e3=Effect.GlobalEffect()
	e3:SetType(EFFECT_TYPE_FIELD)
	e3:SetCode(EFFECT_CANNOT_ACTIVATE)
	e3:SetProperty(EFFECT_FLAG_PLAYER_TARGET)
	e3:SetTargetRange(1,1)
	e3:SetValue(function(e,re,tp)
		if not adjusted or re:IsHasType(EFFECT_TYPE_TRIGGER_F) or re:IsHasType(EFFECT_TYPE_QUICK_F) then return false end
		if re:IsHasType(EFFECT_TYPE_TRIGGER_O) or Duel.GetCurrentChain()==0 then return true end
		if re:IsHasType(EFFECT_TYPE_ACTIVATE) and re:GetHandler():IsType(TYPE_COUNTER) then return false end
		return not (re:IsHasCategory(CATEGORY_NEGATE) or re:IsHasCategory(CATEGORY_DISABLE))
	end)
	Duel.RegisterEffect(e3,0)
end

--Rule 10, https://www.edisonformat.com/edison-rule-differences.html : "you cannot pay costs if doing so would reduce your
--Life Points to 0". The core's EDISON_LP_COST makes Duel.CheckLPCost refuse it, but cards that let you choose how much to pay
--build their list of amounts from Duel.GetLP ("Wall of Revealing Light", "Star Blast", "Bark of Dark Ruler", "Attack of the
--Cornered Rat"), so the list reached your whole Life Points. A list of Life Point amounts (every one a multiple of 100) that
--reaches your Life Points keeps only the amounts you may pay.
do
	local announce=Duel.AnnounceNumber
	function Duel.AnnounceNumber(tp,...)
		local t={...}
		if type(t[1])=="table" then t=t[1] end --Duel.AnnounceNumber(tp,{...}) is the other form
		local lp,reaches,amounts=Duel.GetLP(tp),false,#t>0
		for _,v in ipairs(t) do
			if type(v)~="number" or v<=0 or v%100~=0 then amounts=false break end
			if v>=lp then reaches=true end
		end
		if reaches and amounts then
			local ok,at={},{}
			for i,v in ipairs(t) do if Duel.CheckLPCost(tp,v) then ok[#ok+1]=v at[#ok]=i end end
			if #ok>0 then
				local v,i=announce(tp,table.unpack(ok))
				return v,i and at[i+1] and at[i+1]-1 or i --the index of the choice in the caller's list (0-based, as the core's)
			end
		end
		return announce(tp,...)
	end
end

--Gemini monsters (proc_gemini.lua): upstream treats a Gemini monster whose effects are negated as not having its effects at
--all (`not c:IsDisabled()` in its effect condition), so a negated Gemini's Ignition Effect cannot even be activated. In
--Edison a negated monster's effects are still there and resolve negated ("Super Double Summon" ruling: "the effects it gains
--will be negated by Skill Drain"); the core already negates them while the card is negated, as for any other monster.
do
	function Gemini.EffectStatusCondition(effect)
		return effect:GetHandler():IsGeminiStatus()
	end
end

--Damage Step, Substep 4 - Damage Calculation, https://www.edisonformat.com/battle-phase.html : "ONLY ONE MANUAL CHAIN may be
--built involving: Monster Effects that modify ATK/DEF 'during the damage step'. Examples include "Injection Fairy Lily",
--"Honest", and "Blackwing - Kalut the Moon Shadow"" (rule 8 on edison-rule-differences.html: "Quick Effects of monsters that
--modify ATK/DEF can be activated"; Honest's ruling: "Substep 1 ..., Substep 3 ... or Substep 4 - Damage Calculation").
--Upstream scripts these as usable in the Damage Step up to damage calculation only. A monster's Quick Effect that changes
--ATK or DEF and may be used in the Damage Step may also be used during damage calculation; its condition is read as it would
--be just before damage calculation. Spells and Traps that change ATK/DEF ("Shrink") still cannot be ("CANNOT be activated in
--this substep"), and SINGLE_CHAIN_IN_DAMAGE_SUBSTEP keeps it to one chain.
do
	local register=Card.RegisterEffect
	local phase=Duel.GetCurrentPhase
	local function before_calculation(cond)
		return function(...)
			if phase()~=PHASE_DAMAGE_CAL then return not cond or cond(...) end
			if not cond then return true end
			Duel.GetCurrentPhase=function() return PHASE_DAMAGE end
			local ok,res=pcall(cond,...)
			Duel.GetCurrentPhase=phase
			if not ok then error(res,0) end
			return res
		end
	end
	function Card.RegisterEffect(c,e,...)
		if e:IsHasType(EFFECT_TYPE_QUICK_O) and e:IsHasProperty(EFFECT_FLAG_DAMAGE_STEP) and not e:IsHasProperty(EFFECT_FLAG_DAMAGE_CAL)
			and (e:IsHasCategory(CATEGORY_ATKCHANGE) or e:IsHasCategory(CATEGORY_DEFCHANGE)) and c:GetOriginalType()&TYPE_MONSTER~=0 then
			e:SetProperty(e:GetProperty()|EFFECT_FLAG_DAMAGE_CAL)
			e:SetCondition(before_calculation(e:GetCondition()))
		end
		return register(c,e,...)
	end
end
