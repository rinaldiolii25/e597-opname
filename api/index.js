// ============================================================================
// FILE: api/index.js (VERCEL SERVERLESS BRAIN - DUAL SPREADSHEET ISOLATION)
// Memisahkan akses DataUser & Pengaturan (Sheet Privat Owner) dengan
// MasterData, HasilOpname, & Template_Print (Sheet Operasional Toko).
// ============================================================================

const MASTER_GAS_URL = process.env.MASTER_GAS_URL || "https://script.google.com/macros/s/AKfycbx00sdpyQJRDLda3KD9vGbWeZibSY9Z776cOSd4_Mo25T2maRFX2i--YdiuZHrtRReR/exec";
const SECRET_COURIER_TOKEN = process.env.SECRET_COURIER_TOKEN || "E597_VERCEL_SHIELD_2026_KEY";
const DEFAULT_IMGBB_KEY = process.env.IMGBB_API_KEY || "57780ed2a4e113c899e0f88b9c38b434";

const licenseCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

const FALLBACK_USERS = {
  "202106477": { pass: "Erafone2026", namaLengkap: "Pak Naldi (Store Leader)", role: "ADMIN" },
  "202408242": { pass: "Erafone2026", namaLengkap: "Veidel (ERO)", role: "STAFF" },
  "202404349": { pass: "Erafone2026", namaLengkap: "Exel (ERO)", role: "STAFF" },
  "202608282": { pass: "Erafone2026", namaLengkap: "Frisa (ERO)", role: "STAFF" },
  "202611324": { pass: "Erafone2026", namaLengkap: "Grasia (ERO)", role: "STAFF" }
};

async function callGasCourier(targetUrl, payload) {
  const endpoint = targetUrl && targetUrl !== "INTERNAL" ? targetUrl : MASTER_GAS_URL;
  const bodyData = Object.assign({}, payload, {
    tokenRahasia: SECRET_COURIER_TOKEN
  });

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(bodyData),
    redirect: "follow"
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("Respons kurir Google Sheets tidak valid.");
  }

  if (json.status === "error") {
    throw new Error(json.pesan || "Terjadi kendala pada kurir Google Sheets.");
  }
  return json;
}

async function uploadToImgBB(base64Str, apiKey, namaFile) {
  if (!base64Str || !apiKey) return "";
  const cleanBase64 = String(base64Str).replace(/^data:image\/\w+;base64,/, "");
  const formBody = new URLSearchParams();
  formBody.append("key", apiKey);
  formBody.append("image", cleanBase64);
  if (namaFile) formBody.append("name", namaFile);

  const res = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: formBody
  });
  const json = await res.json();
  if (json && json.success && json.data && json.data.url) {
    return json.data.url;
  }
  throw new Error("Gagal mengunggah foto ke server imgBB.");
}

async function resolveTenantLicense(kodeTokoInput) {
  const kode = String(kodeTokoInput || "E597").toUpperCase().trim();
  const now = Date.now();

  if (licenseCache.has(kode)) {
    const cached = licenseCache.get(kode);
    if (now - cached.ts < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const res = await callGasCourier(MASTER_GAS_URL, {
    rawAction: "raw_getLicense",
    kodeToko: kode
  });

  const lic = res.lisensi || {
    kodeToko: kode,
    namaToko: "E597 Erafone",
    status: "AKTIF",
    expiredDate: "2099-12-31",
    urlApiTarget: "INTERNAL",
    paket: "PRO",
    spreadsheetId: "INTERNAL",
    ownerSpreadsheetId: "INTERNAL"
  };

  if (String(lic.status).toUpperCase() === "SUSPEND") {
    throw new Error("Lisensi toko [" + kode + "] sedang di-SUSPEND sementara. Silakan hubungi Administrator.");
  }

  if (lic.expiredDate) {
    const expTime = new Date(lic.expiredDate + "T23:59:59").getTime();
    if (!isNaN(expTime) && now > expTime) {
      throw new Error("Masa aktif langganan toko [" + kode + "] telah berakhir pada " + lic.expiredDate + ". Silakan perpanjang langganan.");
    }
  }

  lic.paket = String(lic.paket || "PRO").toUpperCase().trim() === "LITE" ? "LITE" : "PRO";
  lic.spreadsheetId = lic.spreadsheetId || "INTERNAL";
  lic.ownerSpreadsheetId = lic.ownerSpreadsheetId || lic.spreadsheetId;
  licenseCache.set(kode, { ts: now, data: lic });
  return lic;
}

function mergeDraftKeranjang(draftAwanStr, draftKlienStr, hapusKode, paketLisensi) {
  let awan = {};
  let klien = {};
  try { awan = JSON.parse(draftAwanStr || "{}"); } catch (e) {}
  try { klien = JSON.parse(draftKlienStr || "{}"); } catch (e) {}

  if (paketLisensi === "LITE") {
    if (hapusKode && klien[hapusKode]) delete klien[hapusKode];
    return JSON.stringify(klien);
  }

  const gabungan = Object.assign({}, awan);

  for (const kode in klien) {
    if (!awan[kode]) {
      gabungan[kode] = klien[kode];
      if (!Array.isArray(gabungan[kode].log)) {
        gabungan[kode].log = [];
      }
    } else {
      const itemA = awan[kode];
      const itemK = klien[kode];
      const hasil = Object.assign({}, itemA);

      const tsDispA = Number(itemA.tsDisp) || 0;
      const tsDispK = Number(itemK.tsDisp) || 0;
      if (tsDispK >= tsDispA) {
        hasil.display = itemK.display;
        hasil.tsDisp = tsDispK;
        hasil.petugasDisp = itemK.petugasDisp || itemK.petugasCek || "";
      }

      const tsGudA = Number(itemA.tsGud) || 0;
      const tsGudK = Number(itemK.tsGud) || 0;
      if (tsGudK >= tsGudA) {
        hasil.gudang = itemK.gudang;
        hasil.tsGud = tsGudK;
        hasil.petugasGud = itemK.petugasGud || itemK.petugasCek || "";
      }

      const tsRemA = Number(itemA.tsRemark) || 0;
      const tsRemK = Number(itemK.tsRemark) || 0;
      if (tsRemK >= tsRemA && itemK.remark && itemK.remark !== "-") {
        hasil.remark = itemK.remark;
        hasil.tsRemark = tsRemK;
      }

      const setPetugas = [];
      [hasil.petugasDisp, hasil.petugasGud, itemA.petugasCek, itemK.petugasCek].forEach((p) => {
        if (!p) return;
        String(p).split("&").forEach((bag) => {
          const nm = bag.trim();
          if (nm && !setPetugas.includes(nm)) setPetugas.push(nm);
        });
      });
      hasil.petugasCek = setPetugas.join(" & ");

      const logGabung = [];
      const sumberLog = [].concat(Array.isArray(itemA.log) ? itemA.log : [], Array.isArray(itemK.log) ? itemK.log : []);
      sumberLog.forEach((entri) => {
        if (entri && !logGabung.includes(entri)) logGabung.push(entri);
      });
      hasil.log = logGabung.slice(-5);

      if (itemK.statusTotal) hasil.statusTotal = itemK.statusTotal;
      if (hasil.statusTotal === "Cocok") hasil.remark = "-";

      gabungan[kode] = hasil;
    }
  }

  if (hapusKode && gabungan[hapusKode]) {
    delete gabungan[hapusKode];
  }

  return JSON.stringify(gabungan);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(200).json({ status: "ok", pesan: "E597 Vercel Security Shield Active (Dual-Sheet Mode)." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = body.action || "";
    const kodeToko = String(body.kodeToko || "E597").toUpperCase().trim();

    if (action === "cekLisensiToko") {
      const lic = await resolveTenantLicense(kodeToko);
      return res.status(200).json({
        status: "sukses",
        lisensi: {
          kodeToko: lic.kodeToko,
          namaToko: lic.namaToko,
          paket: lic.paket,
          expiredDate: lic.expiredDate
        }
      });
    }

    const tenant = await resolveTenantLicense(kodeToko);
    const targetGas = tenant.urlApiTarget;
    const ssId = tenant.spreadsheetId;
    const ownerSsId = tenant.ownerSpreadsheetId;
    const paketAktif = tenant.paket;

    if (action === "cekMaintenance") {
      const raw = await callGasCourier(targetGas, {
        rawAction: "raw_readBundle",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        includeMaster: false,
        includeUsers: false
      });
      const blindMode = paketAktif === "PRO" ? (raw.props.MODE_BLIND_OPNAME || raw.configPublik.modeBlindOpname || "OFF") : "OFF";
      return res.status(200).json({
        status: "sukses",
        maintenance: raw.props.STATUS_MAINTENANCE || "OFF",
        blindOpname: blindMode,
        paketAktif: paketAktif,
        configPublik: raw.configPublik
      });
    }

    if (action === "loginUser") {
      const idInput = String(body.userId || "").trim();
      const passInput = String(body.password || "").trim();

      const raw = await callGasCourier(targetGas, {
        rawAction: "raw_readBundle",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        includeMaster: false,
        includeUsers: true
      });

      const statusMaint = raw.props.STATUS_MAINTENANCE || "OFF";
      const blindMode = paketAktif === "PRO" ? (raw.props.MODE_BLIND_OPNAME || raw.configPublik.modeBlindOpname || "OFF") : "OFF";
      const daftarUser = Array.isArray(raw.users) && raw.users.length > 0 ? raw.users : Object.keys(FALLBACK_USERS).map((k) => ({
        userId: k,
        password: FALLBACK_USERS[k].pass,
        namaLengkap: FALLBACK_USERS[k].namaLengkap,
        role: FALLBACK_USERS[k].role,
        status: "AKTIF"
      }));

      const userAktifList = daftarUser.filter((u) => String(u.status || "AKTIF").toUpperCase() === "AKTIF");
      const idxUser = userAktifList.findIndex((u) => String(u.userId).toLowerCase() === idInput.toLowerCase());

      if (idxUser === -1 || String(userAktifList[idxUser].password) !== passInput) {
        return res.status(200).json({
          status: "error",
          pesan: "User ID (NIK) atau Password tidak sesuai."
        });
      }

      const foundUser = userAktifList[idxUser];
      const roleUser = String(foundUser.role || "STAFF").toUpperCase() === "ADMIN" ? "ADMIN" : "STAFF";

      if (paketAktif === "LITE" && idxUser >= 2 && roleUser !== "ADMIN") {
        return res.status(200).json({
          status: "error",
          pesan: "Paket LITE dibatasi maksimal 2 Akun (1 Admin + 1 Staff). Hubungi Owner untuk Upgrade ke Paket PRO."
        });
      }

      if (statusMaint === "ON" && roleUser !== "ADMIN") {
        return res.status(200).json({
          status: "error",
          pesan: "Sistem sedang dalam Mode Maintenance oleh Store Leader / Admin."
        });
      }

      return res.status(200).json({
        status: "sukses",
        maintenance: statusMaint,
        blindOpname: blindMode,
        paketAktif: paketAktif,
        configPublik: raw.configPublik,
        user: {
          userId: foundUser.userId,
          namaLengkap: foundUser.namaLengkap,
          role: roleUser
        }
      });
    }

    if (action === "init") {
      const raw = await callGasCourier(targetGas, {
        rawAction: "raw_readBundle",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        includeMaster: true,
        includeUsers: false
      });

      const kunciData = raw.kunciData || {};
      const blindMode = paketAktif === "PRO" ? (raw.props.MODE_BLIND_OPNAME || raw.configPublik.modeBlindOpname || "OFF") : "OFF";

      if (paketAktif === "LITE") {
        for (const k in kunciData) {
          kunciData[k].hargaModal = 0;
        }
      }

      return res.status(200).json({
        status: "sukses",
        paketAktif: paketAktif,
        maintenance: raw.props.STATUS_MAINTENANCE || "OFF",
        blindOpname: blindMode,
        kunciData: kunciData,
        draftJson: raw.props.DRAFT_KERANJANG || "{}",
        resetTimestamp: Number(raw.props.RESET_TIMESTAMP) || 0,
        linkExcel: raw.props.LINK_EXCEL_TERAKHIR || "",
        configPublik: raw.configPublik
      });
    }

    if (action === "simpanDraft" || action === "hapusItemDraft") {
      const raw = await callGasCourier(targetGas, {
        rawAction: "raw_readBundle",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        includeMaster: false,
        includeUsers: false
      });

      const serverResetTs = Number(raw.props.RESET_TIMESTAMP) || 0;
      const clientResetTs = Number(body.clientResetTs) || 0;
      const draftAwanLama = raw.props.DRAFT_KERANJANG || "{}";

      if (action === "hapusItemDraft") {
        const kodeHapus = String(body.kodeArtikel || "").trim();
        let objAwan = {};
        try { objAwan = JSON.parse(draftAwanLama); } catch (e) {}
        if (kodeHapus && objAwan[kodeHapus]) delete objAwan[kodeHapus];
        const jsonBaru = JSON.stringify(objAwan);
        const newTs = Date.now();

        await callGasCourier(targetGas, {
          rawAction: "raw_writeProps",
          spreadsheetId: ssId,
          ownerSpreadsheetId: ownerSsId,
          propsToUpdate: {
            DRAFT_KERANJANG: jsonBaru,
            RESET_TIMESTAMP: String(newTs)
          }
        });

        return res.status(200).json({
          status: "sukses",
          draftJson: jsonBaru,
          resetTimestamp: newTs
        });
      }

      if (clientResetTs > 0 && serverResetTs > clientResetTs) {
        return res.status(200).json({
          status: "sukses",
          draftJson: draftAwanLama,
          resetTimestamp: serverResetTs
        });
      }

      const hasilMergeJson = mergeDraftKeranjang(
        draftAwanLama,
        body.jsonString || "{}",
        body.hapusKode || "",
        paketAktif
      );

      await callGasCourier(targetGas, {
        rawAction: "raw_writeProps",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        propsToUpdate: {
          DRAFT_KERANJANG: hasilMergeJson
        }
      });

      return res.status(200).json({
        status: "sukses",
        draftJson: hasilMergeJson,
        resetTimestamp: serverResetTs
      });
    }

    if (action === "hapusDraft") {
      const newResetTs = Date.now();
      await callGasCourier(targetGas, {
        rawAction: "raw_writeProps",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        propsToUpdate: {
          DRAFT_KERANJANG: "{}",
          RESET_TIMESTAMP: String(newResetTs)
        }
      });
      return res.status(200).json({
        status: "sukses",
        pesan: "Seluruh data draft opname di Perangkat & Awan berhasil direset bersih.",
        resetTimestamp: newResetTs
      });
    }

    if (action === "setMaintenance") {
      const nilaiBaru = body.nilai === "ON" ? "ON" : "OFF";
      await callGasCourier(targetGas, {
        rawAction: "raw_writeProps",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        propsToUpdate: { STATUS_MAINTENANCE: nilaiBaru }
      });
      return res.status(200).json({
        status: "sukses",
        maintenance: nilaiBaru,
        pesan: nilaiBaru === "ON"
          ? "Mode Maintenance DIAKTIFKAN. Hanya Admin/Owner yang dapat mengakses aplikasi."
          : "Mode Maintenance DIMATIKAN. Seluruh staf dapat login kembali."
      });
    }

    if (action === "setBlindOpname") {
      if (paketAktif !== "PRO") {
        return res.status(200).json({
          status: "error",
          pesan: "Fitur Saklar Strict Blind Opname (Anti-Tebak Angka) hanya tersedia pada Paket PRO."
        });
      }
      const nilaiBlind = body.nilai === "ON" ? "ON" : "OFF";
      await callGasCourier(targetGas, {
        rawAction: "raw_writeProps",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        propsToUpdate: { MODE_BLIND_OPNAME: nilaiBlind },
        updateSettingKey: "Mode_Blind_Opname",
        updateSettingVal: nilaiBlind
      });
      return res.status(200).json({
        status: "sukses",
        blindOpname: nilaiBlind,
        pesan: nilaiBlind === "ON"
          ? "Strict Blind Opname AKTIF: Indikator warna hijau/merah & angka stok Master disembunyikan dari layar Staff."
          : "Strict Blind Opname NONAKTIF: Indikator warna langsung (Hijau/Merah) kembali ditampilkan."
      });
    }

    if (action === "tambahArtikelBaru") {
      const item = body.itemBaru || {};
      const rolePengirim = String(body.userRole || "STAFF").toUpperCase();
      let urlFotoFinal = "";

      if (item.fotoBase64) {
        if (paketAktif === "LITE" && rolePengirim !== "ADMIN") {
          return res.status(200).json({
            status: "error",
            pesan: "Pada Paket LITE, unggah foto ke imgBB hanya dapat dilakukan oleh akun Admin/Owner."
          });
        }
        const rawKey = await callGasCourier(targetGas, {
          rawAction: "raw_readBundle",
          spreadsheetId: ssId,
          ownerSpreadsheetId: ownerSsId,
          includeMaster: false,
          includeUsers: false
        });
        const imgbbKey = DEFAULT_IMGBB_KEY || rawKey.imgbbApiKey || "";
        if (imgbbKey) {
          urlFotoFinal = await uploadToImgBB(item.fotoBase64, imgbbKey, "Baru_" + item.kode);
        }
      }

      const resTambah = await callGasCourier(targetGas, {
        rawAction: "raw_appendMasterItem",
        spreadsheetId: ssId,
        kode: String(item.kode || "").trim(),
        nama: String(item.nama || "").trim(),
        qty: Number(item.qty) || 0,
        hargaModal: Number(item.hargaModal) || 0,
        fotoUrl: urlFotoFinal
      });

      return res.status(200).json({
        status: "sukses",
        pesan: "Artikel baru [" + item.kode + "] " + item.nama + " berhasil ditambahkan ke daftar opname.",
        kunciData: resTambah.kunciData
      });
    }

    if (action === "uploadFotoPratinjau") {
      const rolePengirim = String(body.userRole || "STAFF").toUpperCase();
      if (paketAktif === "LITE" && rolePengirim !== "ADMIN") {
        return res.status(200).json({
          status: "error",
          pesan: "Pada Paket LITE, fitur Upload Foto Pratinjau hanya tersedia untuk Admin/Owner."
        });
      }

      const kodeArtikel = String(body.kodeArtikel || "").trim();
      const fotoBase64 = body.fotoBase64 || "";
      if (!kodeArtikel || !fotoBase64) {
        throw new Error("Kode artikel atau data foto tidak lengkap.");
      }

      const rawKey = await callGasCourier(targetGas, {
        rawAction: "raw_readBundle",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        includeMaster: false,
        includeUsers: false
      });
      const imgbbKey = DEFAULT_IMGBB_KEY || rawKey.imgbbApiKey || "";
      if (!imgbbKey) {
        throw new Error("IMGBB_API_KEY belum diisi pada Sheet Pengaturan Owner.");
      }

      const urlFotoImgbb = await uploadToImgBB(fotoBase64, imgbbKey, "SKU_" + kodeArtikel);
      const resUpdate = await callGasCourier(targetGas, {
        rawAction: "raw_updatePhotoUrl",
        spreadsheetId: ssId,
        kodeArtikel: kodeArtikel,
        fotoUrl: urlFotoImgbb
      });

      return res.status(200).json({
        status: "sukses",
        fotoUrl: urlFotoImgbb,
        kunciData: resUpdate.kunciData
      });
    }

    if (action === "simpanKeranjang") {
      const paketKirim = body.paketKirim || {};
      const isiKeranjang = Array.isArray(paketKirim.isiKeranjang) ? paketKirim.isiKeranjang : [];

      const rawMaster = await callGasCourier(targetGas, {
        rawAction: "raw_readBundle",
        spreadsheetId: ssId,
        ownerSpreadsheetId: ownerSsId,
        includeMaster: true,
        includeUsers: false
      });
      const kunciData = rawMaster.kunciData || {};

      let totalMasterAll = 0;
      let totalDispAll = 0;
      let totalGudAll = 0;
      let totalFisikAll = 0;
      let totalSelisihQty = 0;
      let totalNilaiSelisihRp = 0;

      const barisHasil = isiKeranjang.map((item) => {
        const kode = String(item.kodeArtikel || "");
        const masterInfo = kunciData[kode] || { nama: item.namaBarang || "", totalMaster: 0, hargaModal: 0 };
        const mQty = Number(masterInfo.totalMaster) || 0;
        const dQty = Number(item.display) || 0;
        const gQty = Number(item.gudang) || 0;
        const fQty = dQty + gQty;
        const selisih = fQty - mQty;
        const hpp = paketAktif === "PRO" ? (Number(masterInfo.hargaModal) || 0) : 0;
        const nilaiSelisihRp = selisih * hpp;

        totalMasterAll += mQty;
        totalDispAll += dQty;
        totalGudAll += gQty;
        totalFisikAll += fQty;
        totalSelisihQty += selisih;
        totalNilaiSelisihRp += nilaiSelisihRp;

        const statusTeks = selisih === 0
          ? "Cocok"
          : "Selisih " + (selisih > 0 ? "+" + selisih : selisih) + " (Master: " + mQty + " | Fisik: " + fQty + ")";

        return {
          kodeArtikel: kode,
          namaBarang: masterInfo.nama || item.namaBarang,
          masterQty: mQty,
          displayQty: dQty,
          gudangQty: gQty,
          totalFisik: fQty,
          selisihQty: selisih,
          hargaModal: hpp,
          selisihRupiah: nilaiSelisihRp,
          statusTotal: statusTeks,
          remark: selisih === 0 ? "-" : (item.remark || "-"),
          petugasCek: item.petugasCek || paketKirim.petugasUtama || "-",
          auditLog: Array.isArray(item.log) ? item.log.join(" | ") : ""
        };
      });

      const ringkasan = {
        petugasUtama: paketKirim.petugasUtama || "-",
        paketAktif: paketAktif,
        totalMasterAll,
        totalDispAll,
        totalGudAll,
        totalFisikAll,
        totalSelisihQty,
        totalNilaiSelisihRp
      };

      const resSimpan = await callGasCourier(targetGas, {
        rawAction: "raw_writeSubmission",
        spreadsheetId: ssId,
        ttdBase64: paketKirim.ttdBase64 || "",
        barisHasil: barisHasil,
        ringkasan: ringkasan,
        autoArchive: paketAktif === "PRO"
      });

      return res.status(200).json({
        status: "sukses",
        pesan: resSimpan.pesan || "Data Stock Opname berhasil disetor ke Lemari Data.",
        linkExcel: resSimpan.linkExcel || "",
        resetTimestamp: resSimpan.resetTimestamp || Date.now()
      });
    }

    if (action === "downloadExcel") {
      const resExcel = await callGasCourier(targetGas, {
        rawAction: "raw_exportXlsx",
        spreadsheetId: ssId,
        kodeToko: kodeToko
      });
      return res.status(200).json(resExcel);
    }

    return res.status(200).json({ status: "error", pesan: "Perintah API tidak dikenali oleh Vercel Brain." });
  } catch (err) {
    return res.status(200).json({
      status: "error",
      pesan: err.message || "Terjadi gangguan pada server Vercel."
    });
  }
};
