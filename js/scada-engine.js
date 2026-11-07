/* LPG SCADA Field Guide - engineering engine (pure functions, no DOM, no init) */
(function (root) {
  'use strict';

  var G = 9.80665;
  var KPA_PER_MMHG = 0.133322;
  var ATM_KPA = 101.325;
  var WATER_RHO = 999.0;

  // Antoine (T in C, P in mmHg). Propane / n-butane. Ideal Raoult mixing on liquid mole fraction.
  var C3 = { A: 6.82973, B: 813.2, C: 248.0, MW: 44.097, rho15: 507 };
  var C4 = { A: 6.80896, B: 935.86, C: 238.73, MW: 58.123, rho15: 584 };

  function clamp(v, lo, hi, dflt) {
    v = Number(v);
    if (!Number.isFinite(v)) v = (dflt !== undefined ? dflt : lo);
    return Math.min(hi, Math.max(lo, v));
  }

  function pSat(c, T) {
    return Math.pow(10, c.A - c.B / (c.C + T)) * KPA_PER_MMHG;
  }

  function blend(volC3) {
    var v3 = clamp(volC3, 0, 100, 50) / 100;
    var v4 = 1 - v3;
    var n3 = v3 * C3.rho15 / C3.MW;
    var n4 = v4 * C4.rho15 / C4.MW;
    var x3 = (n3 + n4) > 0 ? n3 / (n3 + n4) : 0.5;
    return { v3: v3, v4: v4, x3: x3, rho15: v3 * C3.rho15 + v4 * C4.rho15 };
  }

  // Vapor pressure of a propane/butane blend. volC3 = propane liquid volume %, T in C (clamped 10..60)
  function vaporPressure(volC3, T) {
    T = clamp(T, 10, 60, 40);
    var b = blend(volC3);
    var p3 = pSat(C3, T), p4 = pSat(C4, T);
    var kpaAbs = b.x3 * p3 + (1 - b.x3) * p4;
    var barg = (kpaAbs - ATM_KPA) / 100;
    return { T: T, kpaAbs: kpaAbs, bara: kpaAbs / 100, barg: barg, psig: barg * 14.5038, p3: p3, p4: p4, x3: b.x3 };
  }

  function liquidSG(volC3, T, beta) {
    T = clamp(T, 10, 60, 40);
    beta = clamp(beta, 0.0001, 0.0025, 0.002);
    var rho = blend(volC3).rho15 * (1 - beta * (T - 15));
    return { rho: rho, sg: clamp(rho / WATER_RHO, 0.5, 2.0) };
  }

  // NPSH available (m of liquid). Tank vapor space sits at saturation of tankT; pump inlet liquid may be warmer.
  function npsh(o) {
    var tankT = clamp(o.tankT, 10, 60, 40);
    var lineT = clamp(o.lineT, 10, 60, tankT);
    var head = clamp(o.head, 0, 50, 2);
    var hf = clamp(o.hf, 0, 50, 0.5);
    var req = clamp(o.req, 0, 20, 1);
    var pt = vaporPressure(o.c3, tankT);
    var pv = vaporPressure(o.c3, lineT);
    var auto = liquidSG(o.c3, lineT, o.beta);
    var sg = (o.sg === '' || o.sg === null || o.sg === undefined) ? auto.sg : clamp(o.sg, 0.5, 2.0, auto.sg);
    var dpKpa = pt.kpaAbs - pv.kpaAbs;
    var pressureTerm = dpKpa * 1000 / (sg * 1000 * G);
    var npsha = pressureTerm + head - hf;
    var margin = npsha - req;
    var status = margin >= 1 ? 'ok' : (margin >= 0 ? 'marginal' : 'cavitation');
    return { sg: sg, autoSG: auto.sg, dpKpa: dpKpa, pressureTerm: pressureTerm, head: head, hf: hf, npsha: npsha, req: req, margin: margin, ratio: req > 0 ? npsha / req : Infinity, status: status, tankKpa: pt.kpaAbs, lineKpa: pv.kpaAbs };
  }

  // 4-20 mA scaling
  var COUNT_FS = 27648; // Siemens analog norm: 4 mA = 0, 20 mA = 27648
  function mAtoEng(mA, lrv, urv) {
    mA = clamp(mA, 0, 25, 4);
    return lrv + (mA - 4) / 16 * (urv - lrv);
  }
  function engToMA(eng, lrv, urv) {
    var span = urv - lrv;
    if (!(span > 0)) return 4;
    return clamp(4 + (Number(eng) - lrv) / span * 16, 0, 25, 4);
  }
  function mAtoCounts(mA) { return Math.round((clamp(mA, 0, 25, 4) - 4) / 16 * COUNT_FS); }
  function countsToMA(c) { return clamp(4 + Number(c) / COUNT_FS * 16, 0, 25, 4); }
  function loopHealth(mA) {
    if (mA < 3.6) return { level: 'fault', text: 'Below 3.6 mA: open loop, broken wire or dead transmitter (NAMUR NE43 low failure).' };
    if (mA < 3.8) return { level: 'warn', text: 'Under-range 3.6 to 3.8 mA: measurement below LRV or sensor fault.' };
    if (mA <= 20.5) return { level: 'ok', text: 'Healthy: signal inside the 3.8 to 20.5 mA live range.' };
    if (mA <= 21) return { level: 'warn', text: 'Over-range 20.5 to 21 mA: measurement above URV.' };
    return { level: 'fault', text: 'Above 21 mA: transmitter alarm high or loop short (NAMUR NE43 high failure).' };
  }

  var ST_PUMP = [
    '(* FB_LpgPumpCtrl - IEC 61131-3 ST, Siemens S7-1500 (TIA) / Allen-Bradley ControlLogix (Studio 5000) *)',
    '(* Fail-safe convention: every trip input is a normally-closed field contact. TRUE = healthy, FALSE = trip. *)',
    '(* TON / R_TRIG: Siemens use IEC TON, R_TRIG instances. Rockwell: replace TON with TON timer tag (.EN/.DN) and R_TRIG with ONS. *)',
    'FUNCTION_BLOCK FB_LpgPumpCtrl',
    'VAR_INPUT',
    '  xStart, xStop, xReset        : BOOL;',
    '  xAutoReq                     : BOOL;   (* remote auto request from SCADA / lead-lag *)',
    '  xEstopOK, xGasL2OK, xFapOK   : BOOL;   (* hardwired NC contacts: FALSE = trip *)',
    '  xPshhOK                      : BOOL;   (* high-high discharge pressure switch, NC *)',
    '  xSuctionEsdvOpen             : BOOL;   (* limit switch feedback *)',
    '  xDischargeEsdvOpen           : BOOL;',
    '  xMotorRunFb, xOverloadOK     : BOOL;',
    '  rTankLevel_pct               : REAL;   (* scaled 4-20 mA, 0..100 *)',
    '  rDiffPress_bar               : REAL;   (* pump discharge minus suction *)',
    '  rGas_pctLEL                  : REAL;',
    'END_VAR',
    'VAR_IN_OUT',
    '  rLsllSP_pct   : REAL;                  (* default 10.0 *)',
    '  rLshSP_pct    : REAL;                  (* start permissive, default 15.0 *)',
    '  rDpTrip_bar   : REAL;                  (* default 9.0 *)',
    '  rGasL1_pct    : REAL;                  (* default 20.0 *)',
    'END_VAR',
    'VAR_OUTPUT',
    '  xRunCmd       : BOOL;',
    '  xPermissive   : BOOL;',
    '  xTripLatched  : BOOL;',
    '  xGasL1Alarm   : BOOL;',
    '  iFaultCode    : INT;                   (* 0 none, 1 ESD/gas/FAP/PSHH, 2 low-low level, 3 high DP, 4 no run feedback, 5 overload *)',
    'END_VAR',
    'VAR',
    '  tonGasNoise, tonLsll, tonDp, tonNoRun : TON;',
    '  rtStart, rtReset                      : R_TRIG;',
    '  xHardTrip, xLsllTrip, xDpTrip, xNoRunTrip : BOOL;',
    '  xDeadbandL1                           : BOOL;',
    'END_VAR',
    '',
    '(* 1. Edge detection so a stuck button can never restart the pump *)',
    'rtStart(CLK := xStart);',
    'rtReset(CLK := xReset);',
    '',
    '(* 2. Gas Level 1 alarm with 5 %LEL deadband (ISA-18.2) *)',
    'IF rGas_pctLEL >= rGasL1_pct THEN xDeadbandL1 := TRUE;',
    'ELSIF rGas_pctLEL < (rGasL1_pct - 5.0) THEN xDeadbandL1 := FALSE;',
    'END_IF;',
    'xGasL1Alarm := xDeadbandL1;',
    '',
    '(* 3. Debounce: hardwired trips get 200 ms noise filter only; analog trips get 2 s *)',
    'tonGasNoise(IN := NOT (xEstopOK AND xGasL2OK AND xFapOK AND xPshhOK), PT := T#200MS);',
    'tonLsll(IN := (rTankLevel_pct <= rLsllSP_pct), PT := T#2S);',
    'tonDp(IN := xRunCmd AND (rDiffPress_bar >= rDpTrip_bar), PT := T#2S);',
    'tonNoRun(IN := xRunCmd AND NOT xMotorRunFb, PT := T#3S);',
    'xHardTrip  := tonGasNoise.Q;',
    'xLsllTrip  := tonLsll.Q;',
    'xDpTrip    := tonDp.Q;',
    'xNoRunTrip := tonNoRun.Q;',
    '',
    '(* 4. Fault latching: first-out code is held until a valid reset *)',
    'IF NOT xTripLatched THEN',
    '  IF xHardTrip THEN xTripLatched := TRUE; iFaultCode := 1;',
    '  ELSIF xLsllTrip THEN xTripLatched := TRUE; iFaultCode := 2;',
    '  ELSIF xDpTrip THEN xTripLatched := TRUE; iFaultCode := 3;',
    '  ELSIF xNoRunTrip THEN xTripLatched := TRUE; iFaultCode := 4;',
    '  ELSIF xRunCmd AND NOT xOverloadOK THEN xTripLatched := TRUE; iFaultCode := 5;',
    '  END_IF;',
    'ELSIF rtReset.Q AND NOT (xHardTrip OR xLsllTrip OR xDpTrip OR xNoRunTrip) AND xOverloadOK THEN',
    '  xTripLatched := FALSE; iFaultCode := 0;   (* reset only if the cause has cleared *)',
    'END_IF;',
    '',
    '(* 5. Pre-start permissives *)',
    'xPermissive := xEstopOK AND xGasL2OK AND xFapOK AND xPshhOK',
    '               AND xSuctionEsdvOpen AND xDischargeEsdvOpen',
    '               AND (rTankLevel_pct > rLshSP_pct) AND NOT xDeadbandL1',
    '               AND NOT xTripLatched AND xOverloadOK;',
    '',
    '(* 6. Run command: seal-in on valid start, drop on stop, trip or lost permissive *)',
    'IF xTripLatched OR xStop OR NOT (xEstopOK AND xGasL2OK AND xFapOK) THEN',
    '  xRunCmd := FALSE;',
    'ELSIF (rtStart.Q OR xAutoReq) AND xPermissive THEN',
    '  xRunCmd := TRUE;',
    'END_IF;',
    'END_FUNCTION_BLOCK'
  ].join('\n');

  var ST_LEADLAG = [
    '(* FC_LeadLag - alternate lead pump on every stop so run hours equalise *)',
    'FUNCTION FC_LeadLag : BOOL',
    'VAR_INPUT',
    '  xPumpAReady, xPumpBReady, xDemand : BOOL;',
    '  xPumpARunning, xPumpBRunning      : BOOL;',
    'END_VAR',
    'VAR_IN_OUT',
    '  xLeadIsA : BOOL;                    (* retentive *)',
    'END_VAR',
    'VAR_TEMP',
    '  xAnyRun : BOOL;',
    'END_VAR',
    'xAnyRun := xPumpARunning OR xPumpBRunning;',
    'IF NOT xDemand AND NOT xAnyRun THEN',
    '  xLeadIsA := NOT xLeadIsA;           (* swap once demand is satisfied and both are stopped *)',
    'END_IF;',
    'IF xLeadIsA AND NOT xPumpAReady THEN xLeadIsA := FALSE; END_IF;',
    'IF NOT xLeadIsA AND NOT xPumpBReady THEN xLeadIsA := TRUE; END_IF;  (* fail over to the healthy pump *)',
    'FC_LeadLag := xLeadIsA;',
    'END_FUNCTION'
  ].join('\n');

  root.ScadaEngine = {
    clamp: clamp, vaporPressure: vaporPressure, liquidSG: liquidSG, npsh: npsh,
    mAtoEng: mAtoEng, engToMA: engToMA, mAtoCounts: mAtoCounts, countsToMA: countsToMA,
    loopHealth: loopHealth, COUNT_FS: COUNT_FS, ST_PUMP: ST_PUMP, ST_LEADLAG: ST_LEADLAG
  };
})(typeof window !== 'undefined' ? window : globalThis);
