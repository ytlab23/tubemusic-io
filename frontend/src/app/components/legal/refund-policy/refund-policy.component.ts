import { Component, OnInit } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-refund-policy',
  templateUrl: './refund-policy.component.html',
  styleUrls: ['../shared/legal.css'],
})
export class RefundPolicyComponent implements OnInit {
  constructor(private titleService: Title, private metaService: Meta) {}

  ngOnInit(): void {
    this.titleService.setTitle('Refund Policy | TubeMusic.io');
    this.metaService.updateTag({
      name: 'description',
      content:
        'TubeMusic.io refund policy: if our PRO subscription does not work for you, we refund the last billed month — even on day 29. Cancel anytime.',
    });
  }
}
