var request = require('request-promise');
const cheerio = require('cheerio');
const md5 = require('md5');
const API = 'http://dkh.tlu.edu.vn';

request = request.defaults({
  transform(body) {
    let $ = cheerio.load(body);
    err_text = $('#lblErrorInfo').text();
    if (err_text && err_text.trim()) throw err_text;

    return $;
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
  }
});

init = (options = {}) => {
  let jar = request.jar();

  return request('http://dkh.tlu.edu.vn/CMCSoft.IU.Web.info/', {
    ...options,
    jar
  })
  .then(res => jar);
}

parseInitialFormData = ($) => {
  let form = $('form');
  let select = form.find('select');
  let input = form.find('input');

  let data = {};

  input.each((i, elem) => {
    data[$(elem).attr('name')] = $(elem).attr('value');
  });

  select.each((i, elem) => {
    data[$(elem).attr('name')] = $(elem).find($('[selected="selected"]')).attr('value');
  });

  return data;
}

parseSelector = ($) => {
  let data = {};
  let form = $('form');
  let select = form.find('select');

  select.each((i, elem) => {
    let options = $(elem).find($('option'));
    let cooked_options = [];

    options.each((i, option) => {
      option = $(option);

      cooked_options.push({
        value: option.attr('value'),
        text: option.text(),
        selected: option.attr('selected') ? true : false
      });
    });

    data[$(elem).attr('name')] = cooked_options;
  });

  return data;
}

login = (username, password, options = {}) => {
  let endpoint = `${API}/CMCSoft.IU.Web.info/login.aspx`
  return request(endpoint, options)
    .then(parseInitialFormData)
    .then(data => {
      return {
        ...data,
        txtUserName: username,
        txtPassword: md5(password),
      }
    })
    .then(form => {
      return request.post(endpoint, {form, simple: false});
    })
}

getTkbDkh = (options = {}) => {
  return request.get(`${API}/CMCSoft.IU.Web.info/StudyRegister/StudyRegister.aspx`, options)
    .then($ => {
      let tkb = $('#Table4').find('.tableborder');
      tkb.find('br').replaceWith('\n');
      // console.log(tkb.html());
      let rows = tkb.find('tr');

      let data = [];

      rows.each((i, elem) => {
        cols = $(elem).find('td');

        let rows = [];

        cols.each((i, elem) => {
          rows.push($(elem).text().trim());
        }); 

        data.push(rows);
      });

      return data;
    });
}

parseTkbDkh = (data, options = {}) => {
  data = data.slice(1, data.length-1);

  data = data.map(rows => {
    rows = rows.map(cell => {
      let cells = cell.split('\n');

      cells = cells.map(item => item.trim());

      if (cells.length === 1) cells = cells[0];

      return cells;
    });

    let [stt, huy, lop_hoc_phan, hoc_phan, thoi_gian, dia_diem, giang_vien, si_so, da_dk, so_tc, hoc_phi, ghi_chu] = rows;

    return {lop_hoc_phan, hoc_phan, thoi_gian, dia_diem, giang_vien, si_so, da_dk, so_tc, hoc_phi, ghi_chu}
  });

  const date_range_pattern = /(.+?) đến (.+?):( \((.{1,}?)\))?/;
  const time_pattern = /Thứ ([0-9]) tiết ([0-9,]+?) \((.+?)\)/g;

  data = data.map(subject => {
    let ranges = [];
    let khoang_thoi_gian = subject.thoi_gian
      .map(tg => tg.trim())
      .join('|')
      .split('Từ ')
      .filter(a => a)

    let matches = date_range_pattern.exec(khoang_thoi_gian[0]);

    if (matches) {
      let phases = [];

      let [orig, start, end, g3, phase] = matches;
      var match1;

      do {
        match1 = time_pattern.exec(khoang_thoi_gian);

        if (match1) {
          let [orig1, day, periods, type] = match1;

          periods = periods.split(',');

          phases.push({
            day,
            periods,
            type
          });
        };
      } while (match1);

      ranges.push({
        start,
        end,
        phases,
        phase
      });
    }

    subject.thoi_gian = subject.thoi_gian.join('\n');
    return {...subject, ranges};
  });

  return data;
}

getTkb = (data = null, options = {}) => {
  let endpoint = `${API}/CMCSoft.IU.Web.Info/Reports/Form/StudentTimeTable.aspx`;

  return request.get(endpoint, options)
    .then($ => {
      if (!data) return $;

      return request.post(endpoint, {
        ...options,
        form: {
          ...parseInitialFormData($),
          ...data
        }
      });
    })
    .then($ => {
      let tkb = $('#Table4').find('.tableborder');
      tkb.find('br').replaceWith('\n');
      // console.log(tkb.html());
      let rows = tkb.find('tr');

      let data = [];

      rows.each((i, elem) => {
        cols = $(elem).find('td');

        let rows = [];

        cols.each((i, elem) => {
          rows.push($(elem).text().trim());
        }); 

        data.push(rows);
      });

      return data;
    });
}

parseTkb = (data) => {
  data = data.slice(1, data.length - 1);

  data = data.map(rows => {
    rows = rows.map(cell => {
      let cells = cell.split('\n');

      cells = cells.map(item => item.trim());

      if (cells.length === 1) cells = cells[0];

      return cells;
    });

    let [stt, lop_hoc_phan, hoc_phan, thoi_gian, dia_diem, si_so, da_dk, so_tc, hoc_phi, ghi_chu] = rows;

    return {lop_hoc_phan, hoc_phan, thoi_gian, dia_diem, si_so, da_dk, so_tc, hoc_phi, ghi_chu}
  });

  const date_range_pattern = /(.+?) đến (.+?):( \((.{1,}?)\))?/;
  const time_pattern = /Thứ ([0-9]) tiết ([0-9,]+?) \((.+?)\)/g;

  data = data.map(subject => {
    let ranges = [];
    let khoang_thoi_gian = subject.thoi_gian
      .map(tg => tg.trim())
      .join('|')
      .split('Từ ')
      .filter(a => a)

    let matches = date_range_pattern.exec(khoang_thoi_gian[0]);

    if (matches) {
      let phases = [];

      let [orig, start, end, g3, phase] = matches;
      var match1;

      do {
        match1 = time_pattern.exec(khoang_thoi_gian);

        if (match1) {
          let [orig1, day, periods, type] = match1;

          periods = periods.split(',');

          phases.push({
            day,
            periods,
            type
          });
        };
      } while (match1);

      ranges.push({
        start,
        end,
        phases,
        phase
      });
    }

    subject.thoi_gian = subject.thoi_gian.join('\n');
    return {...subject, ranges};
  });

  return data;
}

module.exports = { init, login, getTkbDkh, parseTkbDkh, getTkb, parseTkb, parseSelector, parseInitialFormData }