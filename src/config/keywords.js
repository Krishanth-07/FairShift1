/**
 * @file Hazard Report Keyword Dictionaries
 *
 * Keyword lists for rule-based hazard triage across English, Tamil, and Hindi.
 * NOTE: Tamil and Hindi keyword lists are machine-translated illustrative placeholders.
 * They MUST be reviewed and validated by native speakers before production deployment.
 */

/**
 * Category keyword maps keyed by language code.
 * Each category contains an array of lowercase trigger words/phrases.
 */
export const CATEGORY_KEYWORDS = {
  en: {
    structural_hazard: ['crack', 'collapse', 'unstable', 'tilting', 'sinking', 'foundation', 'wall damage', 'beam'],
    ppe_violation: ['no helmet', 'no gloves', 'no goggles', 'no harness', 'missing ppe', 'no mask', 'no boots'],
    equipment_defect: ['broken', 'malfunction', 'sparking', 'leaking', 'defective', 'faulty', 'jammed', 'overheating'],
    heat_exhaustion: ['dizzy', 'fainted', 'dehydrated', 'heat stroke', 'nausea', 'vomiting', 'heat cramp'],
    unsafe_scaffolding: ['scaffolding', 'railing missing', 'platform loose', 'no guardrail', 'scaffold wobble'],
    wage_dispute: ['unpaid', 'short pay', 'wage theft', 'not paid', 'missing wages', 'salary delayed'],
    biohazard_spill: ['blood spill', 'biohazard', 'chemical spill', 'contamination', 'infectious waste', 'sharps'],
    needlestick_injury: ['needle stick', 'needle prick', 'sharps injury', 'needle injury', 'puncture wound'],
    staffing_shortage: ['understaffed', 'short staffed', 'no relief', 'double shift forced', 'mandatory overtime'],
    equipment_failure: ['ventilator failure', 'monitor down', 'pump failure', 'power outage', 'oxygen supply'],
    verbal_abuse: ['yelling', 'threatened', 'verbal abuse', 'harassment', 'intimidation', 'bullying'],
    missing_ppe: ['no gloves', 'no mask', 'no gown', 'no face shield', 'missing ppe', 'no apron']
  },
  // NOTE: Tamil keywords are illustrative placeholders — require native-speaker review
  ta: {
    structural_hazard: ['விரிசல்', 'இடிவு', 'நிலையற்ற', 'சாய்வு'],
    ppe_violation: ['தலைக்கவசம் இல்லை', 'கையுறை இல்லை'],
    equipment_defect: ['உடைந்த', 'செயலிழப்பு', 'கசிவு', 'பழுதான'],
    heat_exhaustion: ['மயக்கம்', 'நீரிழப்பு', 'வெப்ப அலைப்பு'],
    biohazard_spill: ['இரத்தம் கொட்டியது', 'உயிர் ஆபத்து', 'கிருமி கழிவு'],
    needlestick_injury: ['ஊசி குத்து', 'ஊசி காயம்'],
    staffing_shortage: ['பணியாளர் பற்றாக்குறை', 'நிவாரணம் இல்லை'],
    verbal_abuse: ['கத்துதல்', 'அச்சுறுத்தல்', 'வாய்மொழி துஷ்பிரயோகம்']
  },
  // NOTE: Hindi keywords are illustrative placeholders — require native-speaker review
  hi: {
    structural_hazard: ['दरार', 'ढहना', 'अस्थिर', 'झुकाव', 'नींव'],
    ppe_violation: ['हेलमेट नहीं', 'दस्ताने नहीं', 'चश्मा नहीं'],
    equipment_defect: ['टूटा', 'खराबी', 'रिसाव', 'दोषपूर्ण'],
    heat_exhaustion: ['चक्कर', 'बेहोश', 'निर्जलीकरण', 'लू'],
    biohazard_spill: ['खून गिरा', 'जैव खतरा', 'रासायनिक रिसाव'],
    needlestick_injury: ['सुई चुभना', 'सुई की चोट'],
    staffing_shortage: ['कर्मचारी कमी', 'राहत नहीं', 'जबरदस्ती ओवरटाइम'],
    verbal_abuse: ['चिल्लाना', 'धमकी', 'मौखिक दुर्व्यवहार', 'उत्पीड़न']
  }
};

/**
 * Critical-severity keywords that immediately escalate a report regardless of category.
 * Keyed by language code.
 */
export const CRITICAL_KEYWORDS = {
  en: ['collapse', 'death', 'fatal', 'unconscious', 'trapped', 'electrocution', 'amputation',
       'explosion', 'fire', 'cardiac arrest', 'not breathing', 'crush injury'],
  // NOTE: Tamil critical keywords — require native-speaker review
  ta: ['இடிவு', 'மரணம்', 'மயக்கம்', 'சிக்கிய', 'மின்சாரம் தாக்கு', 'தீ'],
  // NOTE: Hindi critical keywords — require native-speaker review
  hi: ['ढहना', 'मौत', 'बेहोश', 'फंसा', 'करंट लगना', 'आग', 'विस्फोट', 'सांस नहीं']
};
